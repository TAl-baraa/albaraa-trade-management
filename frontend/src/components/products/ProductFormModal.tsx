import { useState, type FormEvent } from 'react'
import { normalizeProductName } from '../../repositories/productRepository'
import type { Product, ProductFormValues } from '../../types/product'
import { Modal } from '../customers/Modal'

interface ProductFormModalProps { product: Product | null; products: Product[]; onClose: () => void; onSubmit: (values: ProductFormValues) => Promise<void>; busy: boolean }
type FormErrors = Partial<Record<'name', string>>

export function ProductFormModal({ product, products, onClose, onSubmit, busy }: ProductFormModalProps) {
  const [values, setValues] = useState<ProductFormValues>({ name: product?.name ?? '', notes: product?.notes ?? '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const update = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => setValues((current) => ({ ...current, [key]: value }))
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const nextErrors: FormErrors = {}
    const normalizedName = normalizeProductName(values.name)
    if (!normalizedName) nextErrors.name = 'اسم المنتج مطلوب.'
    else if (products.some((item) => item.id !== product?.id && normalizeProductName(item.name) === normalizedName)) nextErrors.name = 'اسم المنتج مستخدم لمنتج آخر.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) onSubmit({ ...values, name: values.name.trim().normalize('NFKC'), notes: values.notes.trim() })
  }
  return <Modal title={product ? 'تعديل بيانات المنتج' : 'إضافة منتج'} onClose={onClose} size="large"><form onSubmit={handleSubmit} noValidate><div className="form-grid"><label className="field field--wide"><span>اسم المنتج <b aria-hidden="true">*</b></span><input value={values.name} onChange={(event) => update('name', event.target.value)} aria-invalid={Boolean(errors.name)} />{errors.name && <small className="field-error">{errors.name}</small>}</label><label className="field field--wide"><span>ملاحظات <em>اختياري</em></span><textarea rows={3} value={values.notes} onChange={(event) => update('notes', event.target.value)} /></label></div><div className="modal__footer"><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>إلغاء</button><button className="button button--primary" type="submit" disabled={busy}>{product ? 'حفظ التعديلات' : 'إضافة المنتج'}</button></div></form></Modal>
}
