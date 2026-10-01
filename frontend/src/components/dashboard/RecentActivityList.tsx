import type { Currency } from '../../types/product'
import { formatDate, formatNumber } from '../../utils/formatters'
import { DashboardSection } from './DashboardSection'

export interface RecentActivityItem {
  id: string
  date: string
  customerName: string
  productName?: string
  amount: number
  currency: Currency
}

export function RecentActivityList({ title, items }: { title: string; items: readonly RecentActivityItem[] }) {
  return <DashboardSection title={title} description="آخر 5 عمليات حسب تاريخ العمل، من الأحدث إلى الأقدم">
    {items.length === 0 ? <p className="dashboard-empty">لا توجد عمليات لعرضها.</p> :
      <ul className="dashboard-activity-list">{items.map((item) => <li key={item.id}>
        <div className="dashboard-activity-list__details"><strong>{item.customerName}</strong>{item.productName && <span>{item.productName}</span>}<time dateTime={item.date}>{formatDate(item.date)}</time></div>
        <div className="dashboard-activity-list__amount"><strong>{formatNumber(item.amount)}</strong><span className="currency-badge">{item.currency === 'IQD' ? 'دينار عراقي' : 'دولار أمريكي'}</span></div>
      </li>)}</ul>}
  </DashboardSection>
}
