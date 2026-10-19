import { buildStatementBalancePresentation, type CustomerStatement } from '../../services/customerStatementService'
import type { Customer } from '../../types/customer'
import { formatCustomerStatementDate, formatCustomerStatementPeriod } from '../../utils/customerStatementDates'
import { formatNumber, formatWeight } from '../../utils/formatters'
import { Fragment } from 'react'

const currencyLabel = (currency: CustomerStatement['currency']): string => currency === 'IQD' ? 'الدينار العراقي (IQD)' : 'الدولار الأمريكي (USD)'

export function PrintableCustomerStatement({ customer, statement }: { customer: Customer; statement: CustomerStatement }) {
  const periodLabel = formatCustomerStatementPeriod(statement.startDate, statement.endDate)
  const openingRow = statement.dateRangeOpening

  return <article className="printable-statement" dir="rtl" aria-label={`كشف حساب ${customer.name}`}>
    <header className="printable-statement__header">
      <dl>
        <div className="printable-statement__customer-name"><dt>اسم الزبون</dt><dd>{customer.name}</dd></div>
        <div><dt>العملة</dt><dd>{currencyLabel(statement.currency)}</dd></div>
        <div><dt>الفترة:</dt><dd>{periodLabel}</dd></div>
        <div><dt>تاريخ الإصدار</dt><dd>{formatCustomerStatementDate(new Date())}</dd></div>
      </dl>
    </header>
    <table className="printable-ledger">
      <thead><tr><th>التاريخ</th><th>المادة</th><th>السائق</th><th>الكمية/الوزن</th><th>سعر المفرد</th><th>مجموع السعر</th></tr></thead>
      <tbody>
        {statement.sections.length === 0 && <Fragment><tr><td colSpan={6} className="printable-ledger__empty">لا توجد عمليات ضمن الفترة المحددة</td></tr><tr className="printable-ledger__balance"><td /><td colSpan={4}>الباقي عليه</td><td>صفر</td></tr></Fragment>}
        {statement.sections.map((section, sectionIndex) => <Fragment key={section.id}>
          {sectionIndex === 0 && openingRow && <tr className={`${openingRow.kind === 'opening-credit' ? 'customer-statement__receipt-row ' : ''}printable-ledger__opening`} data-calculated="true"><td>{formatCustomerStatementDate(openingRow.date)}</td><td>{openingRow.kind === 'opening-debt' ? 'الرصيد السابق عليه' : 'الواصل من رصيد سابق'}</td><td /><td /><td /><td>{formatNumber(openingRow.amount)}</td></tr>}
          {section.debits.map((transaction) => transaction.kind === 'sale'
            ? <tr key={transaction.id}><td>{formatCustomerStatementDate(transaction.date)}</td><td><strong>{transaction.record.productNameSnapshot}</strong></td><td>{transaction.record.driverName}</td><td>{formatWeight(transaction.record.weightTons)} طن</td><td>{formatNumber(transaction.record.unitSalePrice)}</td><td>{formatNumber(transaction.amount)}</td></tr>
            : <tr key={transaction.id}><td>{formatCustomerStatementDate(transaction.date)}</td><td><strong>{transaction.record.description}</strong>{transaction.record.notes && <small>{transaction.record.notes}</small>}</td><td /><td /><td /><td>{formatNumber(transaction.amount)}</td></tr>)}
          {(section.debits.length > 0 || (sectionIndex === 0 && openingRow?.kind === 'opening-debt')) && <tr className="printable-ledger__summary" key={`${section.id}-debit-total`}><td /><td colSpan={4}>المجموع</td><td>{formatNumber(section.debitTotal)}</td></tr>}
          {section.carriedCustomerCredit && !(sectionIndex === 0 && openingRow?.kind === 'opening-credit') && <tr className="customer-statement__receipt-row printable-ledger__opening" key={`${section.id}-credit`} data-calculated="true"><td /><td>الواصل من رصيد سابق</td><td /><td /><td /><td>{formatNumber(section.carriedCustomerCredit.amount)}</td></tr>}
          {section.receipts.map((transaction) => <tr className="customer-statement__receipt-row" key={transaction.id}><td>{formatCustomerStatementDate(transaction.date)}</td><td><strong>واصل</strong>{transaction.record.notes && <small>{transaction.record.notes}</small>}</td><td /><td /><td /><td>{formatNumber(transaction.amount)}</td></tr>)}
          {buildStatementBalancePresentation(section.balance).map((row) => <tr className={`printable-ledger__balance ${row.tone === 'red' ? 'customer-statement__credit-balance-row' : ''}`} key={`${section.id}-${row.kind}`}><td /><td colSpan={4}>{row.label}</td><td>{row.displayZero ? 'صفر' : formatNumber(row.amount)}</td></tr>)}
        </Fragment>)}
      </tbody>
    </table>
  </article>
}
