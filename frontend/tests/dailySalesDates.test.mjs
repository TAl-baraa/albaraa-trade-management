import assert from 'node:assert/strict'
import test from 'node:test'
import { getArabicWeekday, shiftLocalDate } from '../src/utils/date.ts'
import { formatDate } from '../src/utils/formatters.ts'

test('formats the visible business date with leading zeros', () => {
  assert.equal(formatDate('2026-10-06'), '06/10/2026')
})

test('returns the correct Arabic weekday without shifting the calendar date', () => {
  assert.equal(getArabicWeekday('2026-10-20'), 'الثلاثاء')
  assert.equal(getArabicWeekday('2026-10-06'), 'الثلاثاء')
  assert.equal(getArabicWeekday('2024-02-29'), 'الخميس')
})

test('navigates across month, year, and leap-year boundaries', () => {
  assert.equal(shiftLocalDate('2026-10-01', -1), '2026-09-30')
  assert.equal(shiftLocalDate('2026-12-31', 1), '2027-01-01')
  assert.equal(shiftLocalDate('2024-02-28', 1), '2024-02-29')
  assert.equal(shiftLocalDate('2024-02-29', 1), '2024-03-01')
})

test('rejects invalid weekday inputs instead of normalizing them', () => {
  assert.equal(getArabicWeekday('2026-02-30'), '')
  assert.equal(getArabicWeekday(''), '')
})
