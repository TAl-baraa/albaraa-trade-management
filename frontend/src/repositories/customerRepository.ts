import type { Customer } from '../types/customer'
import { databaseCommand } from './tauriBridge'

export type CustomerInput = Pick<Customer, 'name' | 'phone' | 'notes'>

export const customerRepository = {
  getAll: (): Promise<Customer[]> => databaseCommand('list_customers', { archived: null }),
  getActive: (): Promise<Customer[]> => databaseCommand('list_customers', { archived: false }),
  getArchived: (): Promise<Customer[]> => databaseCommand('list_customers', { archived: true }),
  getById: (id: string): Promise<Customer | null> => databaseCommand('get_customer', { id }),
  create: (input: CustomerInput): Promise<Customer> => databaseCommand('create_customer', { input }),
  update: (id: string, input: CustomerInput): Promise<Customer> => databaseCommand('update_customer', { id, input }),
  archive: (id: string): Promise<Customer> => databaseCommand('archive_customer', { id }),
  reactivate: (id: string): Promise<Customer> => databaseCommand('reactivate_customer', { id }),
  delete: (id: string): Promise<void> => databaseCommand('delete_customer', { id }),
}
