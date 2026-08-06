export const CURRENT_ACTOR = 'المستخدم الحالي' as const

export type AuditValue = string | number | boolean | null

export interface AuditFieldChange {
  field: string
  previousValue: AuditValue
  newValue: AuditValue
}

export interface OperationHistoryEntry {
  id: string
  type: 'created' | 'updated' | 'deleted'
  actor: typeof CURRENT_ACTOR
  changedAt: string
  changes: AuditFieldChange[]
}

export interface SoftDeletionMetadata {
  isDeleted: boolean
  deletedAt: string | null
  deletedBy: typeof CURRENT_ACTOR | null
  deletionReason: string | null
}
