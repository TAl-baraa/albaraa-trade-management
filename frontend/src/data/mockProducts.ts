import type { Product } from '../types/product'

export const initialProducts: Product[] = [
  { id: 'product-1', name: 'سمنت عادي', purchaseCurrency: 'IQD', purchasePrice: 8_750, exchangeRate: null, notes: 'يُستخدم كسعر افتراضي للمشتريات الجديدة.', isArchived: false, createdAt: '2026-01-10', updatedAt: '2026-07-30' },
  { id: 'product-2', name: 'حديد تسليح 12 ملم', purchaseCurrency: 'USD', purchasePrice: 690, exchangeRate: 1_310, notes: 'يُراجع السعر قبل تسجيل الشراء.', isArchived: false, createdAt: '2026-02-05', updatedAt: '2026-08-01' },
  { id: 'product-3', name: 'بلوك خرساني 20 سم', purchaseCurrency: 'IQD', purchasePrice: 1_050, exchangeRate: null, notes: '', isArchived: false, createdAt: '2026-03-14', updatedAt: '2026-07-28' },
  { id: 'product-4', name: 'رمل مغسول', purchaseCurrency: 'IQD', purchasePrice: 35_000, exchangeRate: null, notes: '', isArchived: false, createdAt: '2026-04-02', updatedAt: '2026-07-26' },
  { id: 'product-5', name: 'جبس بناء', purchaseCurrency: 'USD', purchasePrice: 4.8, exchangeRate: 1_310, notes: 'منتج مؤرشف للتجربة.', isArchived: true, createdAt: '2026-05-11', updatedAt: '2026-07-29' },
]
