import type { Customer } from '../../types/customer'
import { formatNumber } from '../../utils/formatters'
import { buildCustomerBalanceReportRows, type CustomerBalanceReportFilter } from '../../services/customerBalancesReport'

const formatReportDate = (date: Date): string => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(date)

export function PrintableCustomerBalancesReport({ customers, filter = 'all', generatedAt = new Date() }: { customers: Customer[]; filter?: CustomerBalanceReportFilter; generatedAt?: Date }) {
  const rows = buildCustomerBalanceReportRows(customers, filter)
  return <article className="printable-statement printable-balances-report" dir="rtl" aria-label="كشف أرصدة الزبائن">
    <header className="printable-statement__header printable-balances-report__header">
      <h1>كشف أرصدة الزبائن</h1>
      <dl>
        <div><dt>تاريخ التقرير</dt><dd>{formatReportDate(generatedAt)}</dd></div>
        <div><dt>عدد الزبائن</dt><dd>{formatNumber(rows.length)}</dd></div>
        <div><dt>نطاق التقرير</dt><dd>{filter === 'all' ? 'جميع الزبائن' : 'الزبائن المدينون فقط'}</dd></div>
      </dl>
    </header>
    <table className="printable-ledger customer-balances-report-table">
      <thead><tr><th>اسم الزبون</th><th>حساب الدينار</th><th>حساب الدولار</th></tr></thead>
      <tbody>
        {rows.length === 0
          ? <tr><td colSpan={3} className="printable-ledger__empty">{filter === 'all' ? 'لا يوجد زبائن نشطون.' : 'لا يوجد زبائن مدينون.'}</td></tr>
          : rows.map((row) => <tr key={row.id}>
            <td>{row.name}</td>
            <td>{row.iqdBalance}</td>
            <td>{row.usdBalance}</td>
          </tr>)}
      </tbody>
    </table>
  </article>
}
