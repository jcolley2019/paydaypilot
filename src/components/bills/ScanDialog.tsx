import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Camera, CircleAlert, FileUp, ImagePlus, LoaderCircle, RotateCcw, X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScanCandidateCard } from '@/components/bills/ScanCandidateCard'
import { ScanFileList, type ScanFileRow } from '@/components/bills/ScanFileList'
import {
  draftAction,
  draftFromCandidate,
  draftToInsert,
  draftToUpdate,
  type CandidateDraft,
} from '@/components/bills/scanDraft'
import { BillScanError, scanBills } from '@/lib/billScan'
import { batchLabel } from '@/lib/importActions'
import {
  SCAN_BATCH_MAX_FILES,
  downscaleImage,
  planScanBatch,
  planScanFile,
  resolveScanMime,
} from '@/lib/scanImages'
import type { Bill, BillInsert, BillUpdate } from '@/types/bills'

interface PickedFile {
  id: string
  original: File
  /** The shrunk JPEG, once there is one. */
  prepared: File | null
  previewUrl: string | null
  status: 'ready' | 'shrinking' | 'failed'
  error: string | null
}

type Stage = 'pick' | 'extracting' | 'review'

interface ScanProblem {
  message: string
  retryable: boolean
}

// One request does all of this; the lines just keep a long wait honest-feeling.
const EXTRACTING_STEPS = [
  'Reading your files…',
  'Looking for bills and due dates…',
  'Matching them against the bills you already have…',
]

function fileInfo(file: File) {
  return { name: file.name, mime: file.type, bytes: file.size }
}

/** What gets uploaded: the shrunk copy, or the original labelled with its real type. */
function uploadFile(item: PickedFile): File {
  if (item.prepared) return item.prepared
  const mime = resolveScanMime(item.original.name, item.original.type)
  return mime && mime !== item.original.type
    ? new File([item.original], item.original.name, { type: mime })
    : item.original
}

/** True for a drag that carries files (from the desktop), not text or a link from the page. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

interface ScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingBills: Bill[]
  /** Saves the batch — new bills and amount updates — with one plan sync; true when all of it saved. */
  onImport: (inserts: BillInsert[], updates: { id: string; updates: BillUpdate }[]) => Promise<boolean>
}

export function ScanDialog({ open, onOpenChange, existingBills, onImport }: ScanDialogProps) {
  const [stage, setStage] = useState<Stage>('pick')
  const [items, setItems] = useState<PickedFile[]>([])
  const [problem, setProblem] = useState<ScanProblem | null>(null)
  const [foundNothing, setFoundNothing] = useState(false)
  const [drafts, setDrafts] = useState<CandidateDraft[]>([])
  const [adding, setAdding] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [dragging, setDragging] = useState(false)
  // dragenter/dragleave fire for every child the pointer crosses; the drag is over once this is 0.
  const dragDepth = useRef(0)

  const cameraInput = useRef<HTMLInputElement>(null)
  const filesInput = useRef<HTMLInputElement>(null)
  // Bumped on every reset so shrinking and scans still running from before are ignored.
  const session = useRef(0)
  const nextId = useRef(0)
  const previewUrls = useRef(new Set<string>())

  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  useEffect(() => {
    if (stage !== 'extracting') return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [stage])

  const live = items.filter((item) => item.status !== 'failed')
  const plans = planScanBatch(live.map((item) => fileInfo(item.prepared ?? item.original)))
  const planById = new Map(live.map((item, index) => [item.id, plans[index]]))
  const sendable = live.filter((item) => item.status === 'ready' && planById.get(item.id)?.kind === 'ok')
  const shrinking = items.some((item) => item.status === 'shrinking')

  const rows: ScanFileRow[] = items.map((item) => {
    const plan = planById.get(item.id)
    return {
      id: item.id,
      name: item.original.name,
      previewUrl: item.previewUrl,
      isPdf: resolveScanMime(item.original.name, item.original.type) === 'application/pdf',
      originalBytes: item.original.size,
      preparedBytes: item.prepared?.size ?? null,
      shrinking: item.status === 'shrinking',
      problem: item.error ?? (plan?.kind === 'reject' ? (plan.reason ?? null) : null),
    }
  })

  const toAdd = drafts.filter((draft) => draftAction(draft) === 'add')
  const toUpdate = drafts.filter((draft) => draftAction(draft) === 'update')
  const inserts = toAdd.map(draftToInsert)
  const updates = toUpdate.map(draftToUpdate)
  const incomplete = inserts.some((insert) => insert === null) || updates.some((update) => update === null)
  const confirmLabel = batchLabel(toAdd.length, toUpdate.length)
  const matched = drafts.filter((draft) => draft.match).length
  const changed = toUpdate.length

  function trackPreview(file: File): string {
    const url = URL.createObjectURL(file)
    previewUrls.current.add(url)
    return url
  }

  function reset() {
    session.current += 1
    for (const url of previewUrls.current) URL.revokeObjectURL(url)
    previewUrls.current.clear()
    setStage('pick')
    setItems([])
    setProblem(null)
    setFoundNothing(false)
    setDrafts([])
    setAdding(false)
    endDrag()
  }

  function endDrag() {
    dragDepth.current = 0
    setDragging(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next && adding) return
    if (!next) reset()
    onOpenChange(next)
  }

  async function shrinkAll(queue: PickedFile[]) {
    const current = session.current
    for (const item of queue) {
      let update: Pick<PickedFile, 'status' | 'prepared' | 'previewUrl' | 'error'>
      try {
        const prepared = await downscaleImage(item.original)
        if (session.current !== current) return
        update = { status: 'ready', prepared, previewUrl: trackPreview(prepared), error: null }
      } catch (err) {
        if (session.current !== current) return
        const error = err instanceof Error ? err.message : "This browser can't read this photo — use a JPEG instead"
        update = { status: 'failed', prepared: null, previewUrl: item.previewUrl, error }
      }
      setItems((list) => list.map((entry) => (entry.id === item.id ? { ...entry, ...update } : entry)))
    }
  }

  function addFiles(files: File[], fromCamera: boolean) {
    if (files.length === 0) return
    const added = files.map((file): PickedFile => {
      const plan = planScanFile(fileInfo(file))
      const isImage = plan.kind !== 'reject' && resolveScanMime(file.name, file.type) !== 'application/pdf'
      // Camera shots are always redrawn: that bakes in the phone's rotation and trims the upload.
      const shrink = plan.kind === 'shrink' || (fromCamera && isImage)
      nextId.current += 1
      return {
        id: `file-${nextId.current}`,
        original: file,
        prepared: null,
        previewUrl: isImage ? trackPreview(file) : null,
        status: shrink ? 'shrinking' : 'ready',
        error: null,
      }
    })
    setItems((list) => [...list, ...added])
    setProblem(null)
    setFoundNothing(false)
    void shrinkAll(added.filter((item) => item.status === 'shrinking'))
  }

  function handlePicked(event: ChangeEvent<HTMLInputElement>, fromCamera: boolean) {
    const files = Array.from(event.target.files ?? [])
    // Clear the input so picking the same file again still fires a change.
    event.target.value = ''
    addFiles(files, fromCamera)
  }

  function handleDragEnter(event: DragEvent) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    if (stage === 'pick') setDragging(true)
  }

  function handleDragOver(event: DragEvent) {
    if (!carriesFiles(event)) return
    // Without this the browser opens the dropped file instead; outside the pick stage it's refused.
    event.preventDefault()
    event.dataTransfer.dropEffect = stage === 'pick' ? 'copy' : 'none'
  }

  function handleDragLeave(event: DragEvent) {
    if (!carriesFiles(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function handleDrop(event: DragEvent) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    endDrag()
    if (stage === 'pick') addFiles(Array.from(event.dataTransfer.files), false)
  }

  function removeFile(id: string) {
    setItems((list) => list.filter((item) => item.id !== id))
    setProblem(null)
    setFoundNothing(false)
  }

  async function extract() {
    if (sendable.length === 0 || shrinking) return
    const files = sendable.map(uploadFile)
    const current = session.current
    setStage('extracting')
    setElapsed(0)
    setProblem(null)
    setFoundNothing(false)
    try {
      const candidates = await scanBills(
        files,
        existingBills.map(({ name, amount }) => ({ name, amount })),
      )
      if (session.current !== current) return
      if (candidates.length === 0) {
        setFoundNothing(true)
        setStage('pick')
        return
      }
      setDrafts(candidates.map((candidate, index) => draftFromCandidate(candidate, index, existingBills)))
      setStage('review')
    } catch (err) {
      if (session.current !== current) return
      setProblem({
        message: err instanceof Error ? err.message : 'Bill import failed.',
        // Not being allowlisted (403) or a rejected request (4xx) won't change on retry;
        // timeouts and model errors (5xx) or a dropped connection might.
        retryable: err instanceof BillScanError && (err.status === null || err.status >= 500),
      })
      setStage('pick')
    }
  }

  async function confirmImport() {
    const bills = inserts.filter((insert): insert is BillInsert => insert !== null)
    const amountUpdates = updates.filter((update): update is NonNullable<typeof update> => update !== null)
    if (bills.length + amountUpdates.length === 0 || incomplete) return
    setAdding(true)
    const saved = await onImport(bills, amountUpdates)
    setAdding(false)
    if (saved) handleOpenChange(false)
  }

  function backToFiles() {
    setDrafts([])
    setStage('pick')
  }

  const title = stage === 'pick' ? 'Import bills' : stage === 'extracting' ? 'Importing…' : 'Review bills'
  const description =
    stage === 'pick'
      ? "Drop in statements, screenshots, or photos of bills — we'll pull out the bills and due dates."
      : stage === 'extracting'
        ? `Finding bills in ${plural(sendable.length, 'file')}.`
        : matched > 0
          ? `Found ${plural(drafts.length, 'bill')}. ${matched === 1 ? 'One matches a bill' : `${matched} match bills`} you already have — ${changed > 0 ? 'new amounts are set to update' : 'amounts are unchanged, so they’re skipped'}.`
          : `Found ${plural(drafts.length, 'bill')}. Check the details, then add them.`

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[min(90dvh,48rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
      >
        <DialogHeader className="border-b border-border px-4 pt-[max(1rem,env(safe-area-inset-top))] pr-12 pb-3 sm:pt-4">
          <DialogTitle className="pp-display text-lg">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={adding}
            className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-2 sm:top-2"
          >
            <X />
            <span className="sr-only">Close</span>
          </Button>
        </DialogClose>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 dark:scheme-dark">
          {stage === 'pick' && (
            <div className="flex flex-col gap-4">
              {problem && (
                <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <div className="flex gap-2">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <p>{problem.message}</p>
                  </div>
                  {problem.retryable && (
                    <Button type="button" variant="outline" size="sm" className="self-start" onClick={extract}>
                      <RotateCcw />
                      Try again
                    </Button>
                  )}
                </div>
              )}

              {foundNothing && (
                <div role="status" className="flex flex-col gap-1 rounded-lg border border-border bg-muted/50 p-3">
                  <p className="font-medium">We couldn't find any bills in these files.</p>
                  <p className="text-muted-foreground">
                    Try a photo that shows the biller, amount due, and due date, or a full statement page.
                  </p>
                </div>
              )}

              {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center">
                  <FileUp className="size-8 text-muted-foreground" />
                  <p className="font-medium pointer-fine:hidden">Add statements, screenshots, or bill photos</p>
                  <p className="hidden font-medium pointer-fine:block">Drag files here, or choose them below</p>
                  <p className="text-muted-foreground">
                    Up to {SCAN_BATCH_MAX_FILES} files. Large photos are shrunk before they're sent.
                  </p>
                </div>
              ) : (
                <ScanFileList rows={rows} onRemove={removeFile} />
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 pointer-fine:hidden"
                  onClick={() => cameraInput.current?.click()}
                >
                  <Camera />
                  Take photo
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => filesInput.current?.click()}>
                  <ImagePlus />
                  Choose files
                </Button>
              </div>
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => handlePicked(event, true)}
              />
              <input
                ref={filesInput}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(event) => handlePicked(event, false)}
              />
            </div>
          )}

          {stage === 'extracting' && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center" aria-live="polite">
              <LoaderCircle className="size-8 animate-spin text-primary" />
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {EXTRACTING_STEPS[Math.min(Math.floor(elapsed / 6), EXTRACTING_STEPS.length - 1)]}
                </p>
                <p className="text-muted-foreground">This usually takes under a minute.</p>
              </div>
              <p className="pp-label text-xs text-muted-foreground tabular-nums">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              </p>
            </div>
          )}

          {stage === 'review' && (
            <div className="flex flex-col gap-3">
              {drafts.map((draft, index) => (
                <ScanCandidateCard
                  key={draft.key}
                  draft={draft}
                  onChange={(next) => setDrafts((list) => list.map((entry, i) => (i === index ? next : entry)))}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
          {stage === 'pick' && (
            <>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={extract} disabled={sendable.length === 0 || shrinking}>
                {shrinking ? <LoaderCircle className="animate-spin" /> : <FileUp />}
                {shrinking
                  ? 'Preparing…'
                  : sendable.length === 0
                    ? 'Import'
                    : `Import ${plural(sendable.length, 'file')}`}
              </Button>
            </>
          )}

          {stage === 'extracting' && (
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}

          {stage === 'review' && (
            <>
              {incomplete && <p className="mr-auto text-xs text-destructive">Finish the highlighted fields</p>}
              <Button type="button" variant="outline" onClick={backToFiles} disabled={adding}>
                Back
              </Button>
              <Button type="button" onClick={confirmImport} disabled={!confirmLabel || incomplete || adding}>
                {adding ? 'Saving…' : (confirmLabel ?? 'Nothing to save')}
              </Button>
            </>
          )}
        </div>

        {dragging && stage === 'pick' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/90 text-center"
          >
            <FileUp className="size-8 text-primary" />
            <p className="font-medium">Drop to add files</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
