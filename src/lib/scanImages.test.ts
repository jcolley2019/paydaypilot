import { describe, it, expect } from 'vitest'
import {
  SCAN_BATCH_MAX_ENCODED_BYTES,
  SCAN_FILE_TARGET_BYTES,
  encodedBytes,
  planScanBatch,
  resolveScanMime,
  type ScanFileInfo,
} from './scanImages'

const KB = 1024
const MB = 1024 * KB

function file(name: string, mime: string, bytes: number): ScanFileInfo {
  return { name, mime, bytes }
}

function kinds(files: ScanFileInfo[]) {
  return planScanBatch(files).map((plan) => plan.kind)
}

const UNSUPPORTED = 'Only photos (JPG, PNG, WebP, HEIC) and PDFs can be imported'

describe('planScanBatch — per-file limits', () => {
  it('sends photos and screenshots up to 4.5 MB as they are', () => {
    expect(
      kinds([
        file('receipt.jpg', 'image/jpeg', 1 * MB),
        file('screenshot.png', 'image/png', SCAN_FILE_TARGET_BYTES),
        file('app.webp', 'image/webp', 200 * KB),
      ]),
    ).toEqual(['ok', 'ok', 'ok'])
  })

  it('shrinks images over 4.5 MB', () => {
    const [plan] = planScanBatch([file('photo.jpg', 'image/jpeg', SCAN_FILE_TARGET_BYTES + 1)])
    expect(plan).toEqual({ kind: 'shrink', reason: 'Over 4.5 MB — will be resized' })
  })

  it('always converts HEIC photos to JPEG, even small ones', () => {
    expect(planScanBatch([file('IMG_2041.HEIC', 'image/heic', 800 * KB)])[0]).toEqual({
      kind: 'shrink',
      reason: 'HEIC photo — converts to JPEG',
    })
    expect(kinds([file('IMG_2042.heif', 'image/heif', 2 * MB)])).toEqual(['shrink'])
  })

  it('passes PDFs through untouched up to 4.5 MB and rejects bigger ones instead of shrinking', () => {
    const plans = planScanBatch([
      file('checking-sep.pdf', 'application/pdf', 2 * MB),
      file('card-sep.pdf', 'application/pdf', SCAN_FILE_TARGET_BYTES),
      file('annual-summary.pdf', 'application/pdf', SCAN_FILE_TARGET_BYTES + 1),
    ])
    expect(plans.map((plan) => plan.kind)).toEqual(['ok', 'ok', 'reject'])
    expect(plans[2].reason).toBe('PDF is over 4.5 MB — save just the statement pages, or screenshot them')
  })

  it('rejects unsupported types with a reason', () => {
    const plans = planScanBatch([
      file('animation.gif', 'image/gif', 300 * KB),
      file('notes.txt', 'text/plain', 2 * KB),
      file('statements.zip', 'application/zip', 3 * MB),
      file('walkthrough.mp4', 'video/mp4', 4 * MB),
    ])
    expect(plans).toEqual(Array(4).fill({ kind: 'reject', reason: UNSUPPORTED }))
  })

  it('rejects empty files', () => {
    expect(planScanBatch([file('blank.png', 'image/png', 0)])[0]).toEqual({
      kind: 'reject',
      reason: 'This file is empty',
    })
  })

  it('falls back to the file extension when the browser reports no usable type', () => {
    expect(
      kinds([
        file('IMG_0001.HEIC', '', 3 * MB),
        file('statement.PDF', '', 1 * MB),
        file('scan.jpg', 'application/octet-stream', 1 * MB),
        file('receipt.jpeg', 'image/jpg', 1 * MB),
        file('mystery', '', 1 * MB),
        file('archive.tar', '', 1 * MB),
      ]),
    ).toEqual(['shrink', 'ok', 'ok', 'ok', 'reject', 'reject'])
  })
})

describe('planScanBatch — batch limits', () => {
  it('takes up to 8 files and rejects the rest with a reason', () => {
    const files = Array.from({ length: 9 }, (_, i) => file(`shot-${i + 1}.png`, 'image/png', 500 * KB))
    const plans = planScanBatch(files)
    expect(plans.slice(0, 8).every((plan) => plan.kind === 'ok')).toBe(true)
    expect(plans[8]).toEqual({ kind: 'reject', reason: 'Only 8 files per import — import this one next' })
  })

  it("doesn't count rejected files toward the 8", () => {
    const files = [
      file('animation.gif', 'image/gif', 300 * KB),
      ...Array.from({ length: 8 }, (_, i) => file(`shot-${i + 1}.png`, 'image/png', 500 * KB)),
    ]
    expect(kinds(files)).toEqual(['reject', ...Array(8).fill('ok')])
  })

  it('keeps the batch within 30 MB of base64, counting exactly up to the limit', () => {
    const files = [
      ...Array.from({ length: 4 }, (_, i) => file(`statement-${i + 1}.pdf`, 'application/pdf', SCAN_FILE_TARGET_BYTES)),
      file('screenshot.png', 'image/png', SCAN_FILE_TARGET_BYTES),
      file('tiny.png', 'image/png', 1 * KB),
    ]
    // Five 4.5 MB files encode to exactly 30 MB, which still fits; the next byte doesn't.
    expect(5 * encodedBytes(SCAN_FILE_TARGET_BYTES)).toBe(SCAN_BATCH_MAX_ENCODED_BYTES)
    const plans = planScanBatch(files)
    expect(plans.map((plan) => plan.kind)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'reject'])
    expect(plans[5].reason).toBe('Over the 30 MB import limit — import this one separately')
  })

  it('counts files still to be shrunk at the 4.5 MB they are guaranteed to fit under', () => {
    const files = Array.from({ length: 6 }, (_, i) => file(`photo-${i + 1}.jpg`, 'image/jpeg', 20 * MB))
    expect(kinds(files)).toEqual(['shrink', 'shrink', 'shrink', 'shrink', 'shrink', 'reject'])
  })

  it('keeps checking smaller files after one that does not fit', () => {
    const files = [
      ...Array.from({ length: 4 }, (_, i) => file(`statement-${i + 1}.pdf`, 'application/pdf', SCAN_FILE_TARGET_BYTES)),
      file('screenshot.png', 'image/png', 4 * MB),
      file('photo.jpg', 'image/jpeg', 20 * MB),
      file('small.png', 'image/png', 300 * KB),
    ]
    expect(kinds(files)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'reject', 'ok'])
  })

  it('returns one verdict per file, in order, for a mixed batch', () => {
    const plans = planScanBatch([
      file('checking-sep.pdf', 'application/pdf', 1 * MB),
      file('IMG_2041.HEIC', 'image/heic', 3 * MB),
      file('paper-bill.jpg', 'image/jpeg', 9 * MB),
      file('notes.txt', 'text/plain', 2 * KB),
      file('bank-app.png', 'image/png', 2 * MB),
    ])
    expect(plans).toEqual([
      { kind: 'ok' },
      { kind: 'shrink', reason: 'HEIC photo — converts to JPEG' },
      { kind: 'shrink', reason: 'Over 4.5 MB — will be resized' },
      { kind: 'reject', reason: UNSUPPORTED },
      { kind: 'ok' },
    ])
  })
})

describe('encodedBytes', () => {
  it('returns the base64 length, padded to whole 4-character groups', () => {
    expect(encodedBytes(0)).toBe(0)
    expect(encodedBytes(1)).toBe(4)
    expect(encodedBytes(3)).toBe(4)
    expect(encodedBytes(4)).toBe(8)
    expect(encodedBytes(SCAN_FILE_TARGET_BYTES)).toBe(6 * MB)
  })
})

describe('resolveScanMime', () => {
  it('trusts a known browser type and normalises aliases', () => {
    expect(resolveScanMime('a.png', 'image/png')).toBe('image/png')
    expect(resolveScanMime('a.jpg', 'IMAGE/JPG')).toBe('image/jpeg')
    expect(resolveScanMime('live.heic', 'image/heic-sequence')).toBe('image/heic')
  })

  it("doesn't let the extension override a real but unsupported type", () => {
    expect(resolveScanMime('renamed.jpg', 'image/gif')).toBeNull()
  })
})
