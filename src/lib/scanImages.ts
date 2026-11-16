// PP.7.2 — getting picked files ready for a bill scan. planScanBatch decides, per file, whether it
// can be sent as-is, needs shrinking first, or can't be scanned; downscaleImage does the shrinking
// in the browser.
//
// Budget: Anthropic accepts up to 10 MB of base64 per image and 32 MB per request. Each file aims
// for 4.5 MB (about 6 MB once base64-encoded) and the batch total is counted in base64 bytes — the
// size actually sent. 8 files matches the extract-bills function's own limit.
import type { ScanMime } from '@/types/billScan'

const MB = 1024 * 1024

export const SCAN_BATCH_MAX_FILES = 8
export const SCAN_FILE_TARGET_BYTES = 4.5 * MB
export const SCAN_BATCH_MAX_ENCODED_BYTES = 30 * MB

export interface ScanFileInfo {
  name: string
  mime: string
  bytes: number
}

export interface ScanFilePlan {
  kind: 'ok' | 'shrink' | 'reject'
  reason?: string
}

type ScanInputMime = ScanMime | 'image/heic' | 'image/heif'

const MIME_BY_EXTENSION = new Map<string, ScanInputMime>([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['pdf', 'application/pdf'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
])

const MIME_ALIASES = new Map<string, ScanInputMime>([
  ['image/jpg', 'image/jpeg'],
  ['image/heic-sequence', 'image/heic'],
  ['image/heif-sequence', 'image/heif'],
])

const INPUT_MIMES = new Set<string>(MIME_BY_EXTENSION.values())

/**
 * The type to treat a picked file as. Browsers report `image/jpg` for some JPEGs and an empty
 * type for files they don't recognise (HEIC on Windows), so fall back to the extension.
 */
export function resolveScanMime(name: string, mime: string): ScanInputMime | null {
  const type = mime.toLowerCase()
  if (INPUT_MIMES.has(type)) return type as ScanInputMime
  const alias = MIME_ALIASES.get(type)
  if (alias) return alias
  if (type !== '' && type !== 'application/octet-stream') return null
  const dot = name.lastIndexOf('.')
  return dot === -1 ? null : (MIME_BY_EXTENSION.get(name.slice(dot + 1).toLowerCase()) ?? null)
}

/** Base64 length of a file: what it adds to the scan request. */
export function encodedBytes(bytes: number): number {
  return Math.ceil(bytes / 3) * 4
}

/** The verdict for one file on its own; planScanBatch adds the batch-wide limits. */
export function planScanFile(file: ScanFileInfo): ScanFilePlan {
  const mime = resolveScanMime(file.name, file.mime)
  if (!mime) return { kind: 'reject', reason: 'Only photos (JPG, PNG, WebP, HEIC) and PDFs can be scanned' }
  if (file.bytes <= 0) return { kind: 'reject', reason: 'This file is empty' }
  if (mime === 'application/pdf') {
    // PDFs can't be shrunk in the browser, so an oversized one goes back to the user.
    return file.bytes > SCAN_FILE_TARGET_BYTES
      ? { kind: 'reject', reason: 'PDF is over 4.5 MB — save just the statement pages, or screenshot them' }
      : { kind: 'ok' }
  }
  if (mime === 'image/heic' || mime === 'image/heif') {
    return { kind: 'shrink', reason: 'HEIC photo — converts to JPEG' }
  }
  return file.bytes > SCAN_FILE_TARGET_BYTES
    ? { kind: 'shrink', reason: 'Over 4.5 MB — will be resized' }
    : { kind: 'ok' }
}

/** One plan per file, in order. Rejected files don't count toward the batch limits. */
export function planScanBatch(files: ScanFileInfo[]): ScanFilePlan[] {
  let kept = 0
  let encodedTotal = 0
  return files.map((file) => {
    const plan = planScanFile(file)
    if (plan.kind === 'reject') return plan
    if (kept === SCAN_BATCH_MAX_FILES) {
      return { kind: 'reject', reason: `Only ${SCAN_BATCH_MAX_FILES} files per scan — scan this one next` }
    }
    // A file that still needs shrinking counts at the size it's guaranteed to end up under.
    const encoded = encodedBytes(plan.kind === 'shrink' ? SCAN_FILE_TARGET_BYTES : file.bytes)
    if (encodedTotal + encoded > SCAN_BATCH_MAX_ENCODED_BYTES) {
      return { kind: 'reject', reason: 'Over the 30 MB scan limit — scan this one separately' }
    }
    kept += 1
    encodedTotal += encoded
    return plan
  })
}

const SHRINK_STEPS = [
  { longEdge: 2000, quality: 0.8 },
  { longEdge: 1600, quality: 0.7 },
  { longEdge: 1200, quality: 0.7 },
]

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

/** Decodes with the browser's own codecs: Safari reads iPhone HEIC photos, Chrome and Firefox don't. */
async function decodeImage(file: File): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  } catch {
    // Some browsers decode certain formats only through <img>; try that before giving up.
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error("This browser can't read this photo — use a JPEG instead")
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't shrink this photo — try a smaller one"))),
      'image/jpeg',
      quality,
    )
  })
}

function jpegName(name: string): string {
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.jpg`
}

/**
 * Re-encodes an image as a JPEG of at most 4.5 MB: long edge 2000px at quality 0.8, then smaller
 * and lower-quality steps until it fits. Also bakes in camera rotation, since the image is redrawn.
 */
export async function downscaleImage(file: File): Promise<File> {
  const image = await decodeImage(file)
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error("Couldn't shrink this photo — try a smaller one")
    for (const step of SHRINK_STEPS) {
      const scale = Math.min(1, step.longEdge / Math.max(image.width, image.height, 1))
      // Resizing the canvas resets its context, so the fill and smoothing are set every pass.
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      // JPEG has no transparency: paint white first so see-through screenshot areas don't go black.
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.imageSmoothingQuality = 'high'
      context.drawImage(image.source, 0, 0, canvas.width, canvas.height)
      const blob = await canvasToJpeg(canvas, step.quality)
      if (blob.size <= SCAN_FILE_TARGET_BYTES) return new File([blob], jpegName(file.name), { type: 'image/jpeg' })
    }
    throw new Error('Still over 4.5 MB after shrinking — crop it and try again')
  } finally {
    image.release()
  }
}
