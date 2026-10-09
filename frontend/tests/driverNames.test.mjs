import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDriverNameSuggestions, filterDriverNameSuggestions, normalizeDriverName } from '../src/utils/driverNames.ts'

test('matches driver names by prefix and supports Arabic Alef variations', () => {
  const suggestions = buildDriverNameSuggestions(['أحمد جمال', 'احمد علي', 'حسين محمد'])
  assert.deepEqual(filterDriverNameSuggestions(suggestions, 'اح'), ['أحمد جمال', 'احمد علي'])
  assert.deepEqual(filterDriverNameSuggestions(suggestions, 'إح'), ['أحمد جمال', 'احمد علي'])
  assert.deepEqual(filterDriverNameSuggestions(suggestions, 'علي'), [])
})

test('trims names, removes normalized duplicates, and ignores empty values', () => {
  assert.deepEqual(buildDriverNameSuggestions(['  أحمد   علي  ', 'احمد علي', '', '   ', 'حسين محمد']), ['أحمد علي', 'حسين محمد'])
})

test('keeps a new typed driver name unchanged when no suggestion matches', () => {
  const typed = 'سائق جديد'
  assert.equal(normalizeDriverName(typed), 'سائق جديد')
  assert.deepEqual(filterDriverNameSuggestions(['أحمد جمال'], typed), [])
})

test('limits large suggestion lists after sorting and prefix filtering', () => {
  const suggestions = buildDriverNameSuggestions(Array.from({ length: 100 }, (_, index) => `سائق ${index + 1}`))
  assert.equal(filterDriverNameSuggestions(suggestions, 'سائق', 8).length, 8)
})
