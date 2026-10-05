import type { Product } from '../types/product'
import { databaseCommand } from './tauriBridge'

export const normalizeProductName = (name: string): string => name.trim().normalize('NFKC').toLocaleLowerCase('ar')
export type ProductInput = Pick<Product, 'name' | 'notes'>

export const productRepository = {
  getAll: (): Promise<Product[]> => databaseCommand('list_products', { archived: null }),
  getActive: (): Promise<Product[]> => databaseCommand('list_products', { archived: false }),
  getArchived: (): Promise<Product[]> => databaseCommand('list_products', { archived: true }),
  getById: (id: string): Promise<Product | null> => databaseCommand('get_product', { id }),
  create: (input: ProductInput): Promise<Product> => databaseCommand('create_product', { input }),
  update: (id: string, input: ProductInput): Promise<Product> => databaseCommand('update_product', { id, input }),
  archive: (id: string): Promise<Product> => databaseCommand('archive_product', { id }),
  reactivate: (id: string): Promise<Product> => databaseCommand('reactivate_product', { id }),
}
