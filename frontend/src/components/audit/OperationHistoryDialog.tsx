import { History } from 'lucide-react'
import type { OperationHistoryEntry } from '../../types/audit'
import { formatDateTime, formatNumber } from '../../utils/formatters'
import { Modal } from '../customers/Modal'

const typeLabel = { created: 'إنشاء', updated: 'تعديل', deleted: 'حذف' } as const
const valueLabel = (value: string | number | boolean | null): string => value === null || value === '' ? '—' : typeof value === 'number' ? formatNumber(value) : typeof value === 'boolean' ? value ? 'نعم' : 'لا' : value

export function OperationHistoryDialog({ title, history, onClose }: { title: string; history: OperationHistoryEntry[]; onClose: () => void }) {
  return <Modal title={title} onClose={onClose} size="large"><div className="history-list">{history.length === 0 ? <div className="empty-state">لا يتوفر سجل تغييرات سابق لهذه العملية.</div> : history.map((entry) => <article className="history-entry" key={entry.id}><header><History size={18} /><strong>{typeLabel[entry.type]}</strong><span>{formatDateTime(entry.changedAt)}</span></header><p>بواسطة: {entry.actor}</p>{entry.changes.length > 0 && <dl>{entry.changes.map((change, index) => <div key={`${entry.id}-${index}`}><dt>{change.field}</dt><dd><span>{valueLabel(change.previousValue)}</span><b aria-hidden="true">←</b><span>{valueLabel(change.newValue)}</span></dd></div>)}</dl>}</article>)}</div></Modal>
}
