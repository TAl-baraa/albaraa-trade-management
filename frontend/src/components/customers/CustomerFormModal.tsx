import { useState, type FormEvent } from 'react'
import type { Customer, CustomerFormValues } from '../../types/customer'
import { Modal } from './Modal'

interface CustomerFormModalProps { customer: Customer | null; onClose: () => void; onSubmit: (values: CustomerFormValues) => Promise<void>; busy: boolean }
type FormErrors = Partial<Record<'name', string>>

export function CustomerFormModal({ customer, onClose, onSubmit, busy }: CustomerFormModalProps) {
  const [values, setValues] = useState<CustomerFormValues>({
    name: customer?.name ?? '', phone: customer?.phone ?? '', notes: customer?.notes ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const update = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => setValues((current) => ({ ...current, [key]: value }))
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const nextErrors: FormErrors = {}
    if (!values.name.trim()) nextErrors.name = 'اسم الزبون مطلوب.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) onSubmit({ ...values, name: values.name.trim(), phone: values.phone.trim(), notes: values.notes.trim() })
  }
  return <Modal title={customer ? 'تعديل بيانات الزبون' : 'إضافة زبون'} onClose={onClose} size="large"><form onSubmit={handleSubmit} noValidate>
    <div className="form-grid"><label className="field"><span>اسم الزبون <b aria-hidden="true">*</b></span><input value={values.name} onChange={(e) => update('name', e.target.value)} aria-invalid={Boolean(errors.name)} />{errors.name && <small className="field-error">{errors.name}</small>}</label>
    <label className="field"><span>رقم الهاتف <em>اختياري</em></span><input type="tel" dir="ltr" value={values.phone} onChange={(e) => update('phone', e.target.value)} /></label>
    <label className="field field--wide"><span>ملاحظات <em>اختياري</em></span><textarea rows={3} value={values.notes} onChange={(e) => update('notes', e.target.value)} /></label></div>
    <div className="modal__footer"><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>إلغاء</button><button className="button button--primary" type="submit" disabled={busy}>{customer ? 'حفظ التعديلات' : 'إضافة الزبون'}</button></div>
  </form></Modal>
}
