import { useState } from 'react'
import { FileImage, FileText, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ScanFileRow {
  id: string
  name: string
  previewUrl: string | null
  isPdf: boolean
  originalBytes: number
  /** Size after shrinking, once a shrunk copy exists. */
  preparedBytes: number | null
  shrinking: boolean
  /** Why the file won't be sent, if it won't. */
  problem: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Thumb({ row }: { row: ScanFileRow }) {
  // Browsers that can't decode a format (HEIC outside Safari) fail the <img>; fall back to an icon.
  const [broken, setBroken] = useState(false)
  if (row.previewUrl && !broken) {
    return (
      <img
        src={row.previewUrl}
        alt=""
        className="size-12 shrink-0 rounded-md object-cover ring-1 ring-foreground/10"
        onError={() => setBroken(true)}
      />
    )
  }
  const Icon = row.isPdf ? FileText : FileImage
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-foreground/10">
      <Icon className="size-5" />
    </div>
  )
}

function FileStatus({ row }: { row: ScanFileRow }) {
  if (row.shrinking) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3 animate-spin" />
        Shrinking…
      </span>
    )
  }
  if (row.problem) return <span className="text-xs text-destructive">{row.problem}</span>
  return (
    <span className="pp-label text-xs text-muted-foreground">
      {row.preparedBytes === null
        ? `${formatBytes(row.originalBytes)} · ready`
        : `${formatBytes(row.originalBytes)} → ${formatBytes(row.preparedBytes)} · shrunk`}
    </span>
  )
}

interface ScanFileListProps {
  rows: ScanFileRow[]
  onRemove: (id: string) => void
}

export function ScanFileList({ rows, onRemove }: ScanFileListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
          <Thumb key={row.previewUrl ?? 'none'} row={row} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{row.name}</span>
            <FileStatus row={row} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${row.name}`}
            onClick={() => onRemove(row.id)}
          >
            <X className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  )
}
