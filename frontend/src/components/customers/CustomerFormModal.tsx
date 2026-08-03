import { useState, type FormEvent } from 'react'
import type { BalanceDirection, Customer, CustomerFormValues } from '../../types/customer'
import { getBalanceDirection } from '../../types/customer'
import { Modal } from './Modal'

interface CustomerFormModalProps { customer: Customer | null; onClose: () => void; onSubmit: (values: CustomerFormValues) => void }
type FormErrors = Partial<Record<'name' | 'iqdAmount' | 'usdAmount', string>>

const amountFromBalance = (balance: number): string => balance === 0 ? '' : String(Math.abs(balance))

export function CustomerFormModal({ customer, onClose, onSubmit }: CustomerFormModalProps) {
  const [values, setValues] = useState<CustomerFormValues>({
    name: customer?.name ?? '', phone: customer?.phone ?? '', notes: customer?.notes ?? '',
    iqdDirection: getBalanceDirection(customer?.iqdBalance ?? 0), iqdAmount: amountFromBalance(customer?.iqdBalance ?? 0),
    usdDirection: getBalanceDirection(customer?.usdBalance ?? 0), usdAmount: amountFromBalance(customer?.usdBalance ?? 0),
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const update = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => setValues((current) => ({ ...current, [key]: value }))
  const changeDirection = (currency: 'iqd' | 'usd', direction: BalanceDirection) => {
    setValues((current) => ({ ...current, [`${currency}Direction`]: direction, ...(direction === 'settled' ? { [`${currency}Amount`]: '' } : {}) }))
  }
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: FormErrors = {}
    if (!values.name.trim()) nextErrors.name = 'اسم الزبون مطلوب.'
    for (const currency of ['iqd', 'usd'] as const) {
      const direction = values[`${currency}Direction`]
      const rawAmount = values[`${currency}Amount`]
      const amount = Number(rawAmount)
      if (direction !== 'settled' && (rawAmount.trim() === '' || !Number.isFinite(amount) || amount < 0)) nextErrors[`${currency}Amount`] = 'أدخل مبلغًا صحيحًا غير سالب.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) onSubmit({ ...values, name: values.name.trim(), phone: values.phone.trim(), notes: values.notes.trim() })
  }
  return <Modal title={customer ? 'تعديل بيانات الزبون' : 'إضافة زبون'} onClose={onClose} size="large"><form onSubmit={handleSubmit} noValidate>
    <div className="form-grid"><label className="field"><span>اسم الزبون <b aria-hidden="true">*</b></span><input value={values.name} onChange={(e) => update('name', e.target.value)} aria-invalid={Boolean(errors.name)} />{errors.name && <small className="field-error">{errors.name}</small>}</label>
    <label className="field"><span>رقم الهاتف <em>اختياري</em></span><input type="tel" dir="ltr" value={values.phone} onChange={(e) => update('phone', e.target.value)} /></label>
    <label className="field field--wide"><span>ملاحظات <em>اختياري</em></span><textarea rows={3} value={values.notes} onChange={(e) => update('notes', e.target.value)} /></label></div>
    <div className="balance-fields"><BalanceField label="الرصيد الافتتاحي بالدينار" currency="iqd" direction={values.iqdDirection} amount={values.iqdAmount} error={errors.iqdAmount} onDirection={changeDirection} onAmount={(value) => update('iqdAmount', value)} /><BalanceField label="الرصيد الافتتاحي بالدولار" currency="usd" direction={values.usdDirection} amount={values.usdAmount} error={errors.usdAmount} onDirection={changeDirection} onAmount={(value) => update('usdAmount', value)} /></div>
    <div className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button--primary" type="submit">{customer ? 'حفظ التعديلات' : 'إضافة الزبون'}</button></div>
  </form></Modal>
}

interface BalanceFieldProps { label: string; currency: 'iqd' | 'usd'; direction: BalanceDirection; amount: string; error?: string; onDirection: (currency: 'iqd' | 'usd', direction: BalanceDirection) => void; onAmount: (value: string) => void }
function BalanceField({ label, currency, direction, amount, error, onDirection, onAmount }: BalanceFieldProps) {
  return <fieldset className="balance-field"><legend>{label}</legend><label className="field"><span>حالة الرصيد</span><select value={direction} onChange={(e) => onDirection(currency, e.target.value as BalanceDirection)}><option value="settled">مسدد</option><option value="owesUs">عليه</option><option value="weOwe">له</option></select></label><label className="field"><span>المبلغ</span><input type="number" min="0" step="any" inputMode="decimal" value={amount} disabled={direction === 'settled'} onChange={(e) => onAmount(e.target.value)} aria-invalid={Boolean(error)} />{error && <small className="field-error">{error}</small>}</label></fieldset>
}
