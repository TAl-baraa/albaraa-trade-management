const arabicMarks = /[\u0640\u064B-\u065F\u0670]/g
const whitespace = /\s+/g
const arabicCollator = new Intl.Collator('ar', { sensitivity: 'base' })

export const normalizeDriverName = (value: string): string => value
  .trim()
  .replace(whitespace, ' ')
  .normalize('NFKC')
  .replace(arabicMarks, '')
  .replace(/[أإآٱ]/g, 'ا')
  .toLocaleLowerCase('ar')

export const buildDriverNameSuggestions = (names: readonly string[]): string[] => {
  const distinct = new Map<string, string>()
  for (const name of names) {
    const displayName = name.trim().replace(whitespace, ' ')
    const normalized = normalizeDriverName(displayName)
    if (normalized && !distinct.has(normalized)) distinct.set(normalized, displayName)
  }
  return [...distinct.values()].sort(arabicCollator.compare)
}

export const filterDriverNameSuggestions = (suggestions: readonly string[], query: string, limit = 8): string[] => {
  const normalizedQuery = normalizeDriverName(query)
  return suggestions
    .filter((name) => !normalizedQuery || normalizeDriverName(name).startsWith(normalizedQuery))
    .slice(0, limit)
}
