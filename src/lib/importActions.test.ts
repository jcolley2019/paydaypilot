import { describe, it, expect } from 'vitest'
import { amountUpdate, batchLabel, batchSummary, chooseAction, findMatch, type BillMatch } from './importActions'

const tmobile: BillMatch = { id: 'bill-1', name: 'T-Mobile', amount: 94.55 }

describe('import actions', () => {
  it('updates a matched bill whose amount differs', () => {
    expect(chooseAction(97.2, tmobile)).toBe('update')
  })

  it('skips a matched bill whose amount is the same (to the cent)', () => {
    expect(chooseAction(94.55, tmobile)).toBe('skip')
    expect(chooseAction(94.550000001, tmobile)).toBe('skip')
  })

  it('adds an unmatched candidate', () => {
    expect(chooseAction(97.2, null)).toBe('add')
  })

  it('respects the user override', () => {
    expect(chooseAction(97.2, tmobile, 'skip')).toBe('skip')
    expect(chooseAction(97.2, tmobile, 'add')).toBe('add')
    expect(chooseAction(94.55, tmobile, 'update')).toBe('update')
    expect(chooseAction(97.2, null, 'skip')).toBe('skip')
  })

  it('never updates without a match', () => {
    expect(chooseAction(97.2, null, 'update')).toBe('add')
  })

  it('finds the matched bill by name, case-insensitively, and only if it still exists', () => {
    const bills = [{ id: 'bill-1', name: 'T-Mobile', amount: 94.55 }]
    expect(findMatch('t-mobile ', bills)).toEqual(tmobile)
    expect(findMatch('Comcast', bills)).toBeNull()
    expect(findMatch(null, bills)).toBeNull()
  })

  it('carries only the new amount, marking it an estimate when the candidate varies', () => {
    expect(amountUpdate(97.2, 'fixed')).toEqual({ amount: 97.2 })
    expect(amountUpdate(97.2, 'estimate')).toEqual({ amount: 97.2, amount_type: 'estimate' })
  })

  it('labels the batch', () => {
    expect(batchLabel(3, 2)).toBe('Add 3 · Update 2')
    expect(batchLabel(0, 2)).toBe('Update 2')
    expect(batchLabel(0, 0)).toBeNull()
    expect(batchSummary(3, 2)).toBe('3 added, 2 updated')
    expect(batchSummary(1, 0)).toBe('1 added')
  })
})
