import type { Product } from '../../types/product'
import { formatDate, formatNumber } from '../../utils/formatters'
import { Modal } from '../customers/Modal'

const currencyLabel = (currency: Product['purchaseCurrency']): string => currency === 'IQD' ? 'دينار عراقي (IQD)' : 'دولار أمريكي (USD)'

export function ProductDetailsModal({ product, onClose }: { product: Product; onClose: () => void }) {
  return <Modal title="تفاصيل المنتج" onClose={onClose}><div className="details-heading"><h3>{product.name}</h3><span className={`status-badge ${product.isArchived ? 'status-badge--archived' : ''}`}>{product.isArchived ? 'مؤرشف' : 'نشط'}</span></div><dl className="details-grid"><div><dt>عملة الشراء</dt><dd>{currencyLabel(product.purchaseCurrency)}</dd></div><div><dt>سعر الشراء الحالي</dt><dd>{formatNumber(product.purchasePrice)} {product.purchaseCurrency}</dd></div><div><dt>سعر الصرف الحالي</dt><dd>{product.exchangeRate === null ? 'غير مطلوب' : `${formatNumber(product.exchangeRate)} IQD لكل USD`}</dd></div><div><dt>تاريخ الإنشاء</dt><dd>{formatDate(product.createdAt)}</dd></div><div><dt>آخر تحديث</dt><dd>{formatDate(product.updatedAt)}</dd></div><div className="details-grid__wide"><dt>ملاحظات</dt><dd>{product.notes || 'لا توجد ملاحظات'}</dd></div></dl><div className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>إغلاق</button></div></Modal>
}
