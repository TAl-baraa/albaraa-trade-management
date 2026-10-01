import { CircleDollarSign, Coins, type LucideIcon } from 'lucide-react'
import type { DailyTotals } from '../../services/dashboardService'
import { formatNumber } from '../../utils/formatters'
import { SummaryCard } from '../customers/SummaryCard'
import { DashboardSection } from './DashboardSection'

export function DailyActivitySummary({ title, countLabel, activity, icon }: { title: string; countLabel: string; activity: DailyTotals; icon: LucideIcon }) {
  return <DashboardSection title={title}>
    <div className="dashboard-metrics dashboard-metrics--daily">
      <SummaryCard label={countLabel} value={formatNumber(activity.count)} icon={icon} />
      <SummaryCard label="الإجمالي بالدينار العراقي" value={`${formatNumber(activity.totals.IQD)} د.ع`} icon={Coins} />
      <SummaryCard label="الإجمالي بالدولار الأمريكي" value={`${formatNumber(activity.totals.USD)} دولار`} icon={CircleDollarSign} />
    </div>
  </DashboardSection>
}
