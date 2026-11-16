import { describe, it, expect } from 'vitest'
import { emptyRow, isEmptyRow, missingFields, rowCategory, rowToInsert } from './quickAddRows'

describe('quick-add rows', () => {
  it('treats an untouched row as empty, with nothing to finish and nothing to save', () => {
    const row = emptyRow()
    expect(isEmptyRow(row)).toBe(true)
    expect(missingFields(row)).toEqual([])
    expect(rowToInsert(row)).toBeNull()
  })

  it('gives every row its own id', () => {
    expect(emptyRow().id).not.toBe(emptyRow().id)
  })

  it('lists what a started row still needs', () => {
    expect(missingFields({ ...emptyRow(), name: 'Netflix' })).toEqual(['amount', 'day'])
    expect(missingFields({ ...emptyRow(), amount: '12', day: 4 })).toEqual(['name'])
    expect(missingFields({ ...emptyRow(), name: 'Netflix', amount: '0', day: 4 })).toEqual(['amount'])
    expect(rowToInsert({ ...emptyRow(), name: 'Netflix', amount: 'abc', day: 4 })).toBeNull()
  })

  it('builds a monthly bill with the guessed category', () => {
    const insert = rowToInsert({ ...emptyRow(), name: '  Netflix ', amount: '15.49', day: 12 })
    expect(insert).toMatchObject({
      name: 'Netflix',
      category: 'subscriptions',
      csp_bucket: 'fixed',
      amount: 15.49,
      amount_type: 'fixed',
      due_rule: { type: 'monthly_day', day: 12 },
      is_debt: false,
      active: true,
    })
  })

  it('keeps a category the user picked over the guess', () => {
    const row = { ...emptyRow(), name: 'Netflix', amount: '15.49', day: 12 as const, category: 'family' as const }
    expect(rowCategory(row)).toBe('family')
    expect(rowToInsert(row)?.category).toBe('family')
  })

  it('maps the "last day" pick onto a last-day rule', () => {
    const insert = rowToInsert({ ...emptyRow(), name: 'Rent', amount: '1200', day: 'last' })
    expect(insert?.due_rule).toEqual({ type: 'last_day' })
    expect(insert?.category).toBe('housing')
  })
})
