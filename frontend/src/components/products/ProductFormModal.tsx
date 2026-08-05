import { useState, type FormEvent } from 'react'
import { normalizeProductName } from '../../repositories/productRepository'
import type { Product, ProductFormValues } from '../../types/product'
import { Modal } from '../customers/Modal'

interface ProductFormModalProps { product: Product | null; products: Product[]; onClose: () => void; onSubmit: (values: ProductFormValues) => void }
type FieldName = 'name' | 'purchasePrice' | 'exchangeRate'
type FormErrors = Partial<Record<FieldName, string>>

export function ProductFormModal({ product, products, onClose, onSubmit }: ProductFormModalProps) {
  const [values, setValues] = useState<ProductFormValues>({ name: product?.name ?? '', purchaseCurrency: product?.purchaseCurrency ?? 'IQD', purchasePrice: String(product?.purchasePrice ?? 0), exchangeRate: product?.exchangeRate === null || product?.exchangeRate === undefined ? '' : String(product.exchangeRate), notes: product?.notes ?? '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const update = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => setValues((current) => ({ ...current, [key]: value }))
  const changeCurrency = (purchaseCurrency: ProductFormValues['purchaseCurrency']) => {
    setValues((current) => ({ ...current, purchaseCurrency, exchangeRate: purchaseCurrency === 'IQD' ? '' : current.exchangeRate }))
    if (purchaseCurrency === 'IQD') setErrors((current) => ({ ...current, exchangeRate: undefined }))
  }
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: FormErrors = {}
    const normalizedName = normalizeProductName(values.name)
    if (!normalizedName) nextErrors.name = 'اسم المنتج مطلوب.'
    else if (products.some((item) => item.id !== product?.id && normalizeProductName(item.name) === normalizedName)) nextErrors.name = 'اسم المنتج مستخدم لمنتج آخر.'
    const purchasePrice = Number(values.purchasePrice)
    if (values.purchasePrice.trim() === '' || !Number.isFinite(purchasePrice) || purchasePrice < 0) nextErrors.purchasePrice = 'أدخل سعر شراء صحيحًا يساوي صفرًا أو أكثر.'
    if (values.purchaseCurrency === 'USD') {
      const exchangeRate = Number(values.exchangeRate)
      if (values.exchangeRate.trim() === '' || !Number.isFinite(exchangeRate) || exchangeRate <= 0) nextErrors.exchangeRate = 'أدخل سعر صرف صحيحًا أكبر من صفر.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) onSubmit({ ...values, name: values.name.trim().normalize('NFKC'), exchangeRate: values.purchaseCurrency === 'IQD' ? '' : values.exchangeRate, notes: values.notes.trim() })
  }
  return <Modal title={product ? 'تعديل بيانات المنتج' : 'إضافة منتج'} onClose={onClose} size="large"><form onSubmit={handleSubmit} noValidate><div className="form-grid"><label className="field field--wide"><span>اسم المنتج <b aria-hidden="true">*</b></span><input value={values.name} onChange={(event) => update('name', event.target.value)} aria-invalid={Boolean(errors.name)} />{errors.name && <small className="field-error">{errors.name}</small>}</label><label className="field"><span>عملة الشراء <b aria-hidden="true">*</b></span><select value={values.purchaseCurrency} onChange={(event) => changeCurrency(event.target.value as ProductFormValues['purchaseCurrency'])}><option value="IQD">دينار (IQD)</option><option value="USD">دولار (USD)</option></select></label><label className="field"><span>سعر الشراء <b aria-hidden="true">*</b></span><input type="number" min="0" step="any" inputMode="decimal" value={values.purchasePrice} onChange={(event) => update('purchasePrice', event.target.value)} aria-invalid={Boolean(errors.purchasePrice)} />{errors.purchasePrice && <small className="field-error">{errors.purchasePrice}</small>}</label>{values.purchaseCurrency === 'USD' && <label className="field"><span>سعر الصرف <b aria-hidden="true">*</b></span><input type="number" min="0" step="any" inputMode="decimal" value={values.exchangeRate} onChange={(event) => update('exchangeRate', event.target.value)} aria-invalid={Boolean(errors.exchangeRate)} />{errors.exchangeRate && <small className="field-error">{errors.exchangeRate}</small>}</label>}<label className="field field--wide"><span>ملاحظات <em>اختياري</em></span><textarea rows={3} value={values.notes} onChange={(event) => update('notes', event.target.value)} /></label></div><div className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button--primary" type="submit">{product ? 'حفظ التعديلات' : 'إضافة المنتج'}</button></div></form></Modal>
}
