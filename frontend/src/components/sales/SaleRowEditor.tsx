import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Customer } from '../../types/customer'
import type { Product } from '../../types/product'
import type { Sale, SaleFormValues } from '../../types/sale'
import { isValidDateString } from '../../utils/date'
import { formatNumber } from '../../utils/formatters'
import { calculateSaleTotal, isPositiveDecimal } from '../../utils/money'
import { PredictiveSelector } from './PredictiveSelector'
import { MoneyInput } from '../common/MoneyInput'
import { DriverNameAutocomplete } from './DriverNameAutocomplete'

type FieldName = keyof SaleFormValues | 'totalAmount'
type FormErrors = Partial<Record<FieldName, string>>
interface SaleRowEditorProps { customers: Customer[]; products: Product[]; driverNames: string[]; selectedDate: string; sale?: Sale; variant: 'table' | 'card'; onSave: (values: SaleFormValues) => Promise<boolean>; onCancel?: () => void }

const emptyValues = (saleDate: string): SaleFormValues => ({ customerId: '', productId: '', weightTons: '', driverName: '', unitSalePrice: '', saleCurrency: 'IQD', saleDate })
const valuesFromSale = (sale: Sale): SaleFormValues => ({ customerId: sale.customerId, productId: sale.productId, weightTons: String(sale.weightTons), driverName: sale.driverName, unitSalePrice: String(sale.unitSalePrice), saleCurrency: sale.saleCurrency, saleDate: sale.saleDate })

export function SaleRowEditor({ customers, products, driverNames, selectedDate, sale, variant, onSave, onCancel }: SaleRowEditorProps) {
  const weightRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState<SaleFormValues>(() => sale ? valuesFromSale(sale) : emptyValues(selectedDate))
  const [errors, setErrors] = useState<FormErrors>({})
  useEffect(() => { setValues(sale ? valuesFromSale(sale) : emptyValues(selectedDate)); setErrors({}) }, [sale, selectedDate])
  const activeCustomers = customers.filter((customer) => !customer.isArchived)
  const activeProducts = products.filter((product) => !product.isArchived)
  const total = calculateSaleTotal(values.weightTons, values.unitSalePrice)
  const update = <K extends keyof SaleFormValues>(key: K, value: SaleFormValues[K]) => setValues((current) => ({ ...current, [key]: value }))
  const [saving, setSaving] = useState(false)
  const approve = async () => {
    if (saving) return
    setSaving(true)
    try {
      const nextErrors: FormErrors = {}
      if (!activeCustomers.some((customer) => customer.id === values.customerId)) nextErrors.customerId = 'اختر مشتريًا من النتائج.'
      if (!activeProducts.some((product) => product.id === values.productId)) nextErrors.productId = 'اختر منتجًا من النتائج.'
      if (!isPositiveDecimal(values.weightTons)) nextErrors.weightTons = 'أدخل وزنًا أكبر من صفر.'
      if (!values.driverName.trim()) nextErrors.driverName = 'اسم السائق مطلوب.'
      if (!isPositiveDecimal(values.unitSalePrice)) nextErrors.unitSalePrice = 'أدخل سعرًا أكبر من صفر.'
      if (!isValidDateString(values.saleDate)) nextErrors.saleDate = 'أدخل تاريخًا صحيحًا.'
      if (total === null) nextErrors.totalAmount = 'الإجمالي غير صالح.'
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) return
      if (await onSave({ ...values, driverName: values.driverName.trim() }) && !sale) {
        setValues(emptyValues(selectedDate))
        requestAnimationFrame(() => weightRef.current?.focus())
      }
    } finally { setSaving(false) }
  }
  const input = (key: 'weightTons' | 'driverName' | 'unitSalePrice', label: string, numeric = false) => <label className="inline-field"><span className="visually-hidden">{label}</span><input ref={key === 'weightTons' ? weightRef : undefined} type={numeric ? 'number' : 'text'} min={numeric ? '0' : undefined} step={numeric ? 'any' : undefined} inputMode={numeric ? 'decimal' : undefined} placeholder={label} value={values[key]} aria-invalid={Boolean(errors[key])} onChange={(event) => update(key, event.target.value)} />{errors[key] && <small className="field-error">{errors[key]}</small>}</label>
  const controls = {
    weight: input('weightTons', 'الوزن بالطن', true),
    product: <PredictiveSelector compact label="المنتج" placeholder="ابحث عن منتج" options={activeProducts} value={values.productId} error={errors.productId} onChange={(id) => update('productId', id)} />,
    driver: <DriverNameAutocomplete value={values.driverName} suggestions={driverNames} error={errors.driverName} onChange={(name) => update('driverName', name)} />,
    customer: <PredictiveSelector compact label="اسم المشتري" placeholder="ابحث عن مشتري" options={activeCustomers} value={values.customerId} error={errors.customerId} onChange={(id) => update('customerId', id)} />,
    price: <div><MoneyInput value={values.unitSalePrice} label="سعر بيع الطن" placeholder="سعر بيع الطن" invalid={Boolean(errors.unitSalePrice)} onChange={(value) => update('unitSalePrice', value)} />{errors.unitSalePrice && <small className="field-error">{errors.unitSalePrice}</small>}</div>,
    currency: <label className="inline-field"><span className="visually-hidden">العملة</span><select aria-label="العملة" value={values.saleCurrency} onChange={(event) => update('saleCurrency', event.target.value as SaleFormValues['saleCurrency'])}><option value="IQD">IQD</option><option value="USD">USD</option></select></label>,
    total: <div className="inline-total"><output aria-label="الإجمالي المحسوب" aria-live="polite">{total === null ? '—' : `${formatNumber(total)} ${values.saleCurrency}`}</output>{errors.totalAmount && <small className="field-error">{errors.totalAmount}</small>}</div>,
    date: <label className="inline-field"><span className="visually-hidden">التاريخ</span><input type="date" value={values.saleDate} aria-invalid={Boolean(errors.saleDate)} onChange={(event) => update('saleDate', event.target.value)} />{errors.saleDate && <small className="field-error">{errors.saleDate}</small>}</label>,
  }
  const actions = <div className="inline-actions"><button className="button button--primary button--small" type="button" disabled={saving} onClick={approve}><Check size={16} />{sale ? 'اعتماد التعديلات' : 'اعتماد'}</button>{sale && onCancel && <button className="button button--secondary button--small" type="button" onClick={onCancel}><X size={16} />إلغاء</button>}</div>
  if (variant === 'table') return <tr className={`editable-sale-row ${sale ? 'editable-sale-row--editing' : ''}`}><td>{sale ? '—' : '+'}</td><td>{controls.weight}</td><td>{controls.product}</td><td>{controls.driver}</td><td>{controls.customer}</td><td>{controls.price}</td><td>{controls.currency}</td><td>{controls.total}</td><td>{controls.date}</td><td>{actions}</td></tr>
  return <article className={`sale-card sale-card--editor ${sale ? 'sale-card--editing' : ''}`}><header><h2>{sale ? 'تعديل عملية البيع' : 'بيع جديد'}</h2></header><div className="sale-card-editor-grid"><div><span>الوزن (طن)</span>{controls.weight}</div><div><span>المنتج</span>{controls.product}</div><div><span>اسم السائق</span>{controls.driver}</div><div><span>اسم المشتري</span>{controls.customer}</div><div><span>سعر بيع الطن</span>{controls.price}</div><div><span>العملة</span>{controls.currency}</div><div><span>الإجمالي</span>{controls.total}</div><div><span>التاريخ</span>{controls.date}</div></div><footer>{actions}</footer></article>
}
