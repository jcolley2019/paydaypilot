import { describe, it, expect } from 'vitest'
import { guessBillDefaults } from './billGuess'

describe('guessBillDefaults', () => {
  it.each([
    ['Rent', 'housing'],
    ['Mortgage - Wells Fargo', 'housing'],
    ['Duke Power', 'utilities'],
    ['Electricity', 'utilities'],
    ['Gas', 'utilities'],
    ['Water & sewer', 'utilities'],
    ['Xfinity Internet', 'utilities'],
    ['T-Mobile phone', 'utilities'],
    ['Netflix', 'subscriptions'],
    ['Spotify Premium', 'subscriptions'],
    ['Amazon Prime', 'subscriptions'],
    ['Geico', 'insurance'],
    ['Auto loan', 'debt'],
    ['Car payment', 'debt'],
    ['Chase Visa', 'debt'],
    ['Store card', 'debt'],
    ['Gym', 'health'],
    ['Groceries', 'food'],
    ['Daycare', 'family'],
    ['Parking permit', 'transportation'],
  ] as const)('files %s under %s, in fixed costs', (name, category) => {
    expect(guessBillDefaults(name)).toEqual({ category, csp_bucket: 'fixed' })
  })

  it('ignores case and surrounding whitespace', () => {
    expect(guessBillDefaults('  NETFLIX  ').category).toBe('subscriptions')
    expect(guessBillDefaults('mOrTgAgE').category).toBe('housing')
    expect(guessBillDefaults('ALLSTATE').category).toBe('insurance')
  })

  it('falls back to other/fixed for names it does not know', () => {
    for (const name of ['Zorblax 9000', 'asdf qwerty', '12345', '', '   ']) {
      expect(guessBillDefaults(name)).toEqual({ category: 'other', csp_bucket: 'fixed' })
    }
  })

  it('matches whole words only', () => {
    expect(guessBillDefaults("Brent's lawn service").category).toBe('other')
    expect(guessBillDefaults('Carpet cleaning').category).toBe('other')
    expect(guessBillDefaults('Gaslight Theater').category).toBe('other')
  })

  it('lets the more specific keyword win when a name carries two', () => {
    expect(guessBillDefaults('Car insurance').category).toBe('insurance')
    expect(guessBillDefaults('Renters insurance').category).toBe('insurance')
    expect(guessBillDefaults('Home loan').category).toBe('housing')
    expect(guessBillDefaults('Gym membership').category).toBe('health')
    expect(guessBillDefaults('Apple Card').category).toBe('debt')
  })

  it('puts investing and saving in their own CSP buckets', () => {
    expect(guessBillDefaults('Roth IRA')).toEqual({ category: 'other', csp_bucket: 'investment' })
    expect(guessBillDefaults('401(k) top-up')).toEqual({ category: 'other', csp_bucket: 'investment' })
    expect(guessBillDefaults('Emergency fund')).toEqual({ category: 'other', csp_bucket: 'savings' })
  })
})
