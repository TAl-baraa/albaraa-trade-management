import type { LucideIcon } from 'lucide-react'

interface SummaryCardProps { label: string; value: string; icon: LucideIcon; tone?: 'navy' | 'debt' | 'credit' }

export function SummaryCard({ label, value, icon: Icon, tone = 'navy' }: SummaryCardProps) {
  return <article className={`summary-card summary-card--${tone}`}><Icon size={19} aria-hidden="true" /><div><span>{label}</span><strong>{value}</strong></div></article>
}
