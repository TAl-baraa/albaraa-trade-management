import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Customer } from '../../types/customer'
import type { Receipt, ReceiptFormValues } from '../../types/receipt'
import { isValidDateString } from '../../utils/date'
import { isPositiveDecimal } from '../../utils/money'
import { PredictiveSelector } from '../sales/PredictiveSelector'
import { MoneyInput } from '../common/MoneyInput'

type Errors = Partial<Record<keyof ReceiptFormValues, string>>
interface Props { customers: Customer[]; selectedDate: string; receipt?: Receipt; variant: 'table' | 'card'; onSave: (values: ReceiptFormValues) => Promise<boolean>; onCancel?: () => void }
const emptyValues = (businessDate: string): ReceiptFormValues => ({ customerId: '', amount: '', currency: 'IQD', businessDate, notes: '' })
const fromReceipt = (receipt: Receipt): ReceiptFormValues => ({ customerId: receipt.customerId, amount: String(receipt.amount), currency: receipt.currency, businessDate: receipt.businessDate, notes: receipt.notes })

export function ReceiptRowEditor({ customers, selectedDate, receipt, variant, onSave, onCancel }: Props) {
  const amountRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState(() => receipt ? fromReceipt(receipt) : emptyValues(selectedDate))
  const [errors, setErrors] = useState<Errors>({})
  useEffect(() => { setValues(receipt ? fromReceipt(receipt) : emptyValues(selectedDate)); setErrors({}) }, [receipt, selectedDate])
  const activeCustomers = customers.filter((customer) => !customer.isArchived)
  const update = <K extends keyof ReceiptFormValues>(key: K, value: ReceiptFormValues[K]) => setValues((current) => ({ ...current, [key]: value }))
  const [saving, setSaving] = useState(false)
  const approve = async () => {
    if (saving) return
    setSaving(true)
    try { const next: Errors = {}; if (!activeCustomers.some((customer) => customer.id === values.customerId)) next.customerId = 'اختر زبونًا من النتائج.'; if (!isPositiveDecimal(values.amount)) next.amount = 'أدخل مبلغًا أكبر من صفر.'; if (!isValidDateString(values.businessDate)) next.businessDate = 'أدخل تاريخًا صحيحًا.'; setErrors(next); if (Object.keys(next).length === 0 && await onSave({ ...values, notes: values.notes.trim() }) && !receipt) { setValues(emptyValues(selectedDate)); requestAnimationFrame(() => amountRef.current?.focus()) } } finally { setSaving(false) }
  }
  const customer = <PredictiveSelector compact label="اسم الزبون" placeholder="ابحث عن زبون" options={activeCustomers} value={values.customerId} error={errors.customerId} onChange={(id) => update('customerId', id)} />
  const amount = <div><MoneyInput focusRef={amountRef} value={values.amount} label="المبلغ المستلم" placeholder="المبلغ المستلم" invalid={Boolean(errors.amount)} onChange={(value) => update('amount', value)} />{errors.amount && <small className="field-error">{errors.amount}</small>}</div>
  const currency = <label className="inline-field"><span className="visually-hidden">العملة</span><select aria-label="العملة" value={values.currency} onChange={(event) => update('currency', event.target.value as ReceiptFormValues['currency'])}><option value="IQD">IQD</option><option value="USD">USD</option></select></label>
  const date = <label className="inline-field"><span className="visually-hidden">التاريخ</span><input type="date" value={values.businessDate} aria-invalid={Boolean(errors.businessDate)} onChange={(event) => update('businessDate', event.target.value)} />{errors.businessDate && <small className="field-error">{errors.businessDate}</small>}</label>
  const notes = <label className="inline-field"><span className="visually-hidden">ملاحظات</span><input placeholder="ملاحظات اختيارية" value={values.notes} onChange={(event) => update('notes', event.target.value)} /></label>
  const actions = <div className="inline-actions"><button className="button button--primary button--small" type="button" disabled={saving} onClick={approve}><Check size={16} />{receipt ? 'اعتماد التعديلات' : 'اعتماد'}</button>{receipt && onCancel && <button className="button button--secondary button--small" type="button" onClick={onCancel}><X size={16} />إلغاء</button>}</div>
  if (variant === 'table') return <tr className={`editable-sale-row ${receipt ? 'editable-sale-row--editing' : ''}`}><td>{receipt ? '—' : '+'}</td><td>{customer}</td><td>{amount}</td><td>{currency}</td><td>{date}</td><td>{notes}</td><td>{actions}</td></tr>
  return <article className={`sale-card sale-card--editor ${receipt ? 'sale-card--editing' : ''}`}><header><h2>{receipt ? 'تعديل الواصل' : 'واصل جديد'}</h2></header><div className="sale-card-editor-grid"><div><span>اسم الزبون</span>{customer}</div><div><span>المبلغ المستلم</span>{amount}</div><div><span>العملة</span>{currency}</div><div><span>التاريخ</span>{date}</div><div><span>ملاحظات</span>{notes}</div></div><footer>{actions}</footer></article>
}
