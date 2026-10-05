export type Currency = 'IQD' | 'USD'

export interface Product {
  id: string
  name: string
  notes: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductFormValues {
  name: string
  notes: string
}
