import { CURRENT_ACTOR, type AuditFieldChange, type AuditValue, type OperationHistoryEntry } from '../types/audit'

export const createHistoryEntry = (type: OperationHistoryEntry['type'], changes: AuditFieldChange[] = []): OperationHistoryEntry => ({
  id: `history-${crypto.randomUUID()}`,
  type,
  actor: CURRENT_ACTOR,
  changedAt: new Date().toISOString(),
  changes,
})

export const collectChanges = <T extends object>(previous: T, next: T, fields: ReadonlyArray<{ key: keyof T; label: string }>): AuditFieldChange[] =>
  fields.flatMap(({ key, label }) => {
    const previousValue = previous[key] as AuditValue
    const newValue = next[key] as AuditValue
    return Object.is(previousValue, newValue) ? [] : [{ field: label, previousValue, newValue }]
  })
