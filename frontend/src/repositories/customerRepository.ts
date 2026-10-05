import type { Customer } from '../types/customer'
import { receiptRepository } from './receiptRepository'
import { saleRepository } from './saleRepository'
import { databaseCommand } from './tauriBridge'

export type CustomerInput = Pick<Customer, 'name' | 'phone' | 'notes' | 'iqdBalance' | 'usdBalance'>

export const customerRepository = {
  getAll: (): Promise<Customer[]> => databaseCommand('list_customers', { archived: null }),
  getActive: (): Promise<Customer[]> => databaseCommand('list_customers', { archived: false }),
  getArchived: (): Promise<Customer[]> => databaseCommand('list_customers', { archived: true }),
  getById: (id: string): Promise<Customer | null> => databaseCommand('get_customer', { id }),
  create: (input: CustomerInput): Promise<Customer> => databaseCommand('create_customer', { input }),
  update: (id: string, input: CustomerInput): Promise<Customer> => databaseCommand('update_customer', { id, input }),
  archive: (id: string): Promise<Customer> => databaseCommand('archive_customer', { id }),
  reactivate: (id: string): Promise<Customer> => databaseCommand('reactivate_customer', { id }),
  delete: async (id: string): Promise<void> => {
    // Until transactions move to SQLite, their references are also checked here.
    if (saleRepository.getSnapshot().some(sale => sale.customerId === id) || receiptRepository.getSnapshot().some(receipt => receipt.customerId === id)) {
      throw new Error('لا يمكن حذف زبون له سجل معاملات.')
    }
    await databaseCommand('delete_customer', { id })
  },
  updateAccountingBalances: async (previous: Customer[], next: Customer[]): Promise<void> => {
    const updates = next.flatMap(customer => {
      const original = previous.find(item => item.id === customer.id)
      if (!original) throw new Error('تعذر العثور على الزبون.')
      if (original.iqdBalance === customer.iqdBalance && original.usdBalance === customer.usdBalance && original.hasTransactionHistory === customer.hasTransactionHistory) return []
      return [{ id: customer.id, expectedIqdBalance: original.iqdBalance, expectedUsdBalance: original.usdBalance, iqdBalance: customer.iqdBalance, usdBalance: customer.usdBalance, hasTransactionHistory: customer.hasTransactionHistory }]
    })
    await databaseCommand('update_customer_balances', { updates })
  },
}
