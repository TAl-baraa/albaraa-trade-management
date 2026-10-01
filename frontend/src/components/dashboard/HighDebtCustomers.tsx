import type { Customer } from '../../types/customer'
import type { Currency } from '../../types/product'
import { formatNumber } from '../../utils/formatters'
import { DashboardSection } from './DashboardSection'

export function HighDebtCustomers({ customers, currency }: { customers: readonly Customer[]; currency: Currency }) {
  const label = currency === 'IQD' ? 'الدينار العراقي' : 'الدولار الأمريكي'
  return <DashboardSection title={`أعلى أرصدة الزبائن المدينة — ${label}`} description="أعلى 5 أرصدة موجبة للزبائن النشطين">
    {customers.length === 0 ? <p className="dashboard-empty">لا توجد أرصدة مدينة بهذه العملة.</p> :
      <ol className="dashboard-debt-list">{customers.map((customer) => <li key={customer.id}>
        <strong>{customer.name}</strong><span className="balance balance--debt">{formatNumber(currency === 'IQD' ? customer.iqdBalance : customer.usdBalance)} {currency === 'IQD' ? 'د.ع' : 'دولار'}</span>
      </li>)}</ol>}
  </DashboardSection>
}
