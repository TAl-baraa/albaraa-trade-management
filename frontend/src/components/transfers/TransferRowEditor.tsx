import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Customer } from '../../types/customer'
import type { Transfer, TransferFormValues } from '../../types/transfer'
import { isValidDateString } from '../../utils/date'
import { isPositiveDecimal } from '../../utils/money'
import { PredictiveSelector } from '../sales/PredictiveSelector'
import { MoneyInput } from '../common/MoneyInput'

type Errors = Partial<Record<keyof TransferFormValues, string>>
interface Props { customers: Customer[]; selectedDate: string; transfer?: Transfer; variant: 'table' | 'card'; onSave: (values: TransferFormValues) => Promise<boolean>; onCancel?: () => void }
const emptyValues = (businessDate: string): TransferFormValues => ({ customerId: '', amount: '', currency: 'IQD', businessDate, description: '', notes: '' })
const fromTransfer = (transfer: Transfer): TransferFormValues => ({ customerId: transfer.customerId, amount: String(transfer.amount), currency: transfer.currency, businessDate: transfer.businessDate, description: transfer.description, notes: transfer.notes })

export function TransferRowEditor({ customers, selectedDate, transfer, variant, onSave, onCancel }: Props) {
  const amountRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState(() => transfer ? fromTransfer(transfer) : emptyValues(selectedDate))
  const [errors, setErrors] = useState<Errors>({})
  useEffect(() => { setValues(transfer ? fromTransfer(transfer) : emptyValues(selectedDate)); setErrors({}) }, [transfer, selectedDate])
  const activeCustomers = customers.filter((customer) => !customer.isArchived)
  const update = <K extends keyof TransferFormValues>(key: K, value: TransferFormValues[K]) => setValues((current) => ({ ...current, [key]: value }))
  const [saving, setSaving] = useState(false)
  const approve = async () => {
    if (saving) return
    setSaving(true)
    try { const next: Errors = {}; if (!activeCustomers.some((customer) => customer.id === values.customerId)) next.customerId = 'اختر زبونًا من النتائج.'; if (!isPositiveDecimal(values.amount)) next.amount = 'أدخل مبلغًا أكبر من صفر.'; if (!isValidDateString(values.businessDate)) next.businessDate = 'أدخل تاريخًا صحيحًا.'; if (!values.description.trim()) next.description = 'أدخل بيان الحوالة.'; setErrors(next); if (Object.keys(next).length === 0 && await onSave({ ...values, description: values.description.trim(), notes: values.notes.trim() }) && !transfer) { setValues(emptyValues(selectedDate)); requestAnimationFrame(() => amountRef.current?.focus()) } } finally { setSaving(false) }
  }
  const customer = <PredictiveSelector compact label="اسم الزبون" placeholder="ابحث عن زبون" options={activeCustomers} value={values.customerId} error={errors.customerId} onChange={(id) => update('customerId', id)} />
  const amount = <div><MoneyInput focusRef={amountRef} value={values.amount} label="المبلغ" placeholder="المبلغ" invalid={Boolean(errors.amount)} onChange={(value) => update('amount', value)} />{errors.amount && <small className="field-error">{errors.amount}</small>}</div>
  const currency = <label className="inline-field"><span className="visually-hidden">العملة</span><select aria-label="العملة" value={values.currency} onChange={(event) => update('currency', event.target.value as TransferFormValues['currency'])}><option value="IQD">IQD</option><option value="USD">USD</option></select></label>
  const date = <label className="inline-field"><span className="visually-hidden">التاريخ</span><input type="date" value={values.businessDate} aria-invalid={Boolean(errors.businessDate)} onChange={(event) => update('businessDate', event.target.value)} />{errors.businessDate && <small className="field-error">{errors.businessDate}</small>}</label>
  const description = <label className="inline-field"><span className="visually-hidden">البيان</span><input placeholder="بيان الحوالة" value={values.description} aria-invalid={Boolean(errors.description)} onChange={(event) => update('description', event.target.value)} />{errors.description && <small className="field-error">{errors.description}</small>}</label>
  const notes = <label className="inline-field"><span className="visually-hidden">ملاحظات</span><input placeholder="ملاحظات اختيارية" value={values.notes} onChange={(event) => update('notes', event.target.value)} /></label>
  const actions = <div className="inline-actions"><button className="button button--primary button--small" type="button" disabled={saving} onClick={approve}><Check size={16} />{transfer ? 'اعتماد التعديلات' : 'اعتماد'}</button>{transfer && onCancel && <button className="button button--secondary button--small" type="button" onClick={onCancel}><X size={16} />إلغاء</button>}</div>
  if (variant === 'table') return <tr className={`editable-sale-row ${transfer ? 'editable-sale-row--editing' : ''}`}><td>{transfer ? '—' : '+'}</td><td>{customer}</td><td>{amount}</td><td>{currency}</td><td>{date}</td><td>{description}</td><td>{notes}</td><td>{actions}</td></tr>
  return <article className={`sale-card sale-card--editor ${transfer ? 'sale-card--editing' : ''}`}><header><h2>{transfer ? 'تعديل الحوالة' : 'حوالة جديدة'}</h2></header><div className="sale-card-editor-grid"><div><span>اسم الزبون</span>{customer}</div><div><span>المبلغ</span>{amount}</div><div><span>العملة</span>{currency}</div><div><span>التاريخ</span>{date}</div><div><span>البيان</span>{description}</div><div><span>ملاحظات</span>{notes}</div></div><footer>{actions}</footer></article>
}
