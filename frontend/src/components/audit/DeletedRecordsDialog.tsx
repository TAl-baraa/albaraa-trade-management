import { History } from 'lucide-react'
import type { Receipt } from '../../types/receipt'
import type { Sale } from '../../types/sale'
import { formatDate, formatDateTime, formatNumber } from '../../utils/formatters'
import { Modal } from '../customers/Modal'

type DeletedRecord = { kind: 'sale'; record: Sale } | { kind: 'receipt'; record: Receipt }

export function DeletedRecordsDialog({ title, records, onHistory, onClose }: { title: string; records: DeletedRecord[]; onHistory: (record: Sale | Receipt) => void; onClose: () => void }) {
  return <Modal title={title} onClose={onClose} size="large"><div className="deleted-records">{records.length === 0 ? <div className="empty-state">لا توجد عمليات محذوفة.</div> : records.map(({ kind, record }) => <article className="deleted-record" key={record.id}><header><div><strong>{kind === 'sale' ? record.productNameSnapshot : record.customerNameSnapshot}</strong><span className="status-badge status-badge--archived">محذوف</span></div><button className="button button--secondary button--small" type="button" onClick={() => onHistory(record)}><History size={16} />السجل</button></header>{kind === 'sale' ? <p>{record.customerNameSnapshot} — {formatNumber(record.weightTons)} طن — {record.driverName} — {formatNumber(record.unitSalePrice)} {record.saleCurrency} — الإجمالي {formatNumber(record.totalAmount)} {record.saleCurrency} — {formatDate(record.saleDate)}</p> : <p>{formatNumber(record.amount)} {record.currency} — {formatDate(record.businessDate)}{record.notes ? ` — ${record.notes}` : ''}</p>}<dl><div><dt>تاريخ الحذف</dt><dd>{formatDateTime(record.deletedAt)}</dd></div><div><dt>المستخدم</dt><dd>{record.deletedBy ?? '—'}</dd></div><div><dt>سبب الحذف</dt><dd>{record.deletionReason ?? 'لم يُذكر سبب'}</dd></div></dl></article>)}</div></Modal>
}
