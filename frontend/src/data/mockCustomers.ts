import type { Customer } from '../types/customer'

export const initialCustomers: Customer[] = [
  {
    id: 'customer-1', name: 'أحمد عبد الكريم', phone: '07701234567', notes: 'مقاول بناء يتعامل بالدينار.',
    iqdBalance: 5_000_000, usdBalance: 0, lastPurchaseDate: '2026-07-28', lastPaymentDate: '2026-07-20',
    hasTransactionHistory: true, isArchived: false, createdAt: '2025-11-12', archivedAt: null,
  },
  {
    id: 'customer-2', name: 'مصطفى جاسم محمد', phone: '07814567890', notes: 'يفضل التواصل صباحًا.',
    iqdBalance: 0, usdBalance: 1_250, lastPurchaseDate: '2026-07-31', lastPaymentDate: null,
    hasTransactionHistory: true, isArchived: false, createdAt: '2026-01-08', archivedAt: null,
  },
  {
    id: 'customer-3', name: 'حيدر كريم عباس', phone: '07509876543', notes: 'له مبلغ متبقٍ من دفعة سابقة.',
    iqdBalance: -850_000, usdBalance: 0, lastPurchaseDate: '2026-06-14', lastPaymentDate: '2026-07-02',
    hasTransactionHistory: true, isArchived: false, createdAt: '2025-09-23', archivedAt: null,
  },
  {
    id: 'customer-4', name: 'علي فاضل حسن', phone: '07735556677', notes: 'حسابه بالدينار والدولار منفصلان.',
    iqdBalance: 2_400_000, usdBalance: -300, lastPurchaseDate: '2026-08-01', lastPaymentDate: '2026-07-25',
    hasTransactionHistory: true, isArchived: false, createdAt: '2026-02-17', archivedAt: null,
  },
  {
    id: 'customer-5', name: 'سعدون مهدي صالح', phone: '07801112233', notes: 'الحساب مسدد بالكامل.',
    iqdBalance: 0, usdBalance: 0, lastPurchaseDate: '2026-05-19', lastPaymentDate: '2026-06-01',
    hasTransactionHistory: true, isArchived: false, createdAt: '2025-12-04', archivedAt: null,
  },
  {
    id: 'customer-6', name: 'قاسم نوري حميد', phone: '', notes: 'زبون جديد بلا معاملات.',
    iqdBalance: 0, usdBalance: 0, lastPurchaseDate: null, lastPaymentDate: null,
    hasTransactionHistory: false, isArchived: false, createdAt: '2026-08-02', archivedAt: null,
  },
  {
    id: 'customer-7', name: 'وليد صباح محمود', phone: '07709998877', notes: 'حساب مؤرشف ومسدد.',
    iqdBalance: 0, usdBalance: 0, lastPurchaseDate: '2025-10-11', lastPaymentDate: '2025-10-20',
    hasTransactionHistory: true, isArchived: true, createdAt: '2025-03-16', archivedAt: '2026-01-15',
  },
]
