import type { Customer } from '../types/customer'
import type { Sale, SaleFormValues } from '../types/sale'
import { calculateSaleTotal } from '../utils/money'
import { databaseCommand } from './tauriBridge'

export interface SaleMutationResult {
  sale?: Sale
  sales: Sale[]
  customers: Customer[]
}

interface SaleInput {
  customerId: string
  productId: string
  weightTons: string
  driverName: string
  unitSalePrice: string
  saleCurrency: Sale['saleCurrency']
  totalAmount: number
  saleDate: string
}

const toInput = (values: SaleFormValues): SaleInput => {
  const totalAmount = calculateSaleTotal(values.weightTons, values.unitSalePrice)
  if (totalAmount === null) throw new Error('الوزن أو سعر البيع غير صالح.')
  return { ...values, totalAmount }
}

export const saleRepository = {
  getAll: (): Promise<Sale[]> => databaseCommand('list_sales'),
  getByBusinessDate: (businessDate: string): Promise<Sale[]> => databaseCommand('list_sales_by_business_date', { businessDate }),
  getById: (id: string): Promise<Sale | null> => databaseCommand('get_sale', { id }),
  create: (values: SaleFormValues): Promise<SaleMutationResult> => databaseCommand('create_sale', { input: toInput(values) }),
  update: (id: string, values: SaleFormValues): Promise<SaleMutationResult> => databaseCommand('update_sale', { id, input: toInput(values) }),
  delete: (id: string, reason: string): Promise<SaleMutationResult> => databaseCommand('soft_delete_sale', { id, reason }),
  toggleReviewed: (id: string): Promise<SaleMutationResult> => databaseCommand('toggle_sale_reviewed', { id }),
}
