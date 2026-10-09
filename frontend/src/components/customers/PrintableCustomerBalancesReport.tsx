import type { Customer } from '../../types/customer'
import { formatNumber } from '../../utils/formatters'
import { buildCustomerBalanceReportRows } from '../../services/customerBalancesReport'

const formatReportDate = (date: Date): string => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(date)

export function PrintableCustomerBalancesReport({ customers, generatedAt = new Date() }: { customers: Customer[]; generatedAt?: Date }) {
  const rows = buildCustomerBalanceReportRows(customers)
  return <article className="printable-statement printable-balances-report" dir="rtl" aria-label="كشف أرصدة الزبائن">
    <header className="printable-statement__header printable-balances-report__header">
      <h1>كشف أرصدة الزبائن</h1>
      <dl>
        <div><dt>تاريخ التقرير</dt><dd>{formatReportDate(generatedAt)}</dd></div>
        <div><dt>عدد الزبائن</dt><dd>{formatNumber(rows.length)}</dd></div>
      </dl>
    </header>
    <table className="printable-ledger customer-balances-report-table">
      <thead><tr><th>اسم الزبون</th><th>حساب الدينار</th><th>حساب الدولار</th></tr></thead>
      <tbody>
        {rows.length === 0
          ? <tr><td colSpan={3} className="printable-ledger__empty">لا يوجد زبائن نشطون.</td></tr>
          : rows.map((row) => <tr key={row.id}>
            <td>{row.name}</td>
            <td>{row.iqdBalance}</td>
            <td>{row.usdBalance}</td>
          </tr>)}
      </tbody>
    </table>
  </article>
}
