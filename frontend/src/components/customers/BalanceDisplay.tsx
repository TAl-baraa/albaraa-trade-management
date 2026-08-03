import { formatBalance } from '../../utils/formatters'

interface BalanceDisplayProps { balance: number; currency: 'IQD' | 'USD' }

export function BalanceDisplay({ balance, currency }: BalanceDisplayProps) {
  const tone = balance > 0 ? 'debt' : balance < 0 ? 'credit' : 'settled'
  return <span className={`balance balance--${tone}`}>{formatBalance(balance, currency)}</span>
}
