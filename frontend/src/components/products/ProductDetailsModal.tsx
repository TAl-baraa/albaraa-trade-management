import type { Product } from '../../types/product'
import { formatDate } from '../../utils/formatters'
import { Modal } from '../customers/Modal'

export function ProductDetailsModal({ product, onClose }: { product: Product; onClose: () => void }) {
  return <Modal title="تفاصيل المنتج" onClose={onClose}><div className="details-heading"><h3>{product.name}</h3><span className={`status-badge ${product.isArchived ? 'status-badge--archived' : ''}`}>{product.isArchived ? 'مؤرشف' : 'نشط'}</span></div><dl className="details-grid"><div><dt>تاريخ الإنشاء</dt><dd>{formatDate(product.createdAt)}</dd></div><div><dt>آخر تحديث</dt><dd>{formatDate(product.updatedAt)}</dd></div><div className="details-grid__wide"><dt>ملاحظات</dt><dd>{product.notes || 'لا توجد ملاحظات'}</dd></div></dl><div className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>إغلاق</button></div></Modal>
}
