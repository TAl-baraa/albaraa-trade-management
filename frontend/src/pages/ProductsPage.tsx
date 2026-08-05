import { Archive, Package, Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfirmationModal } from '../components/customers/ConfirmationModal'
import { Toast } from '../components/customers/Toast'
import { ProductDetailsModal } from '../components/products/ProductDetailsModal'
import { ProductFormModal } from '../components/products/ProductFormModal'
import { ProductList } from '../components/products/ProductList'
import { productRepository } from '../repositories/productRepository'
import type { Product, ProductFormValues } from '../types/product'

type ViewMode = 'active' | 'archived'
type Confirmation = { type: 'archive' | 'reactivate'; product: Product }

export function ProductsPage() {
  const [products, setProductsState] = useState<Product[]>(() => productRepository.getAll())
  const [view, setView] = useState<ViewMode>('active')
  const [search, setSearch] = useState('')
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null)
  const [formProduct, setFormProduct] = useState<Product | null | undefined>(undefined)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const setProducts = (update: (current: Product[]) => Product[]) => setProductsState((current) => { const next = update(current); productRepository.saveAll(next); return next })
  const visibleProducts = useMemo(() => { const term = search.trim().normalize('NFKC').toLocaleLowerCase('ar'); return products.filter((product) => product.isArchived === (view === 'archived') && (!term || product.name.normalize('NFKC').toLocaleLowerCase('ar').includes(term))) }, [products, search, view])
  const saveProduct = (values: ProductFormValues) => {
    const now = new Date().toISOString()
    const fields = { name: values.name, purchaseCurrency: values.purchaseCurrency, purchasePrice: Number(values.purchasePrice), exchangeRate: values.purchaseCurrency === 'USD' ? Number(values.exchangeRate) : null, notes: values.notes, updatedAt: now }
    if (formProduct) { setProducts((current) => current.map((product) => product.id === formProduct.id ? { ...product, ...fields } : product)); setToast('تم حفظ تعديلات المنتج بنجاح.') }
    else { const product: Product = { id: `product-${crypto.randomUUID()}`, ...fields, isArchived: false, createdAt: now }; setProducts((current) => [product, ...current]); setView('active'); setToast('تمت إضافة المنتج بنجاح.') }
    setFormProduct(undefined)
  }
  const completeConfirmation = () => { if (!confirmation) return; const isArchived = confirmation.type === 'archive'; const now = new Date().toISOString(); setProducts((current) => current.map((product) => product.id === confirmation.product.id ? { ...product, isArchived, updatedAt: now } : product)); setToast(isArchived ? 'تمت أرشفة المنتج بنجاح.' : 'تمت إعادة تفعيل المنتج بنجاح.'); setConfirmation(null) }
  return <div className="page-container"><header className="page-header"><div><span className="eyebrow">المبيعات والمشتريات</span><h1>إدارة المنتجات</h1><p>تُسجّل المنتجات هنا لتسهيل اختيارها عند إدخال المبيعات والمشتريات.</p></div><button className="button button--primary" type="button" onClick={() => setFormProduct(null)}><Plus size={19} />إضافة منتج</button></header><section className="customers-panel"><div className="toolbar"><div className="view-switch" role="group" aria-label="حالة المنتجات"><button type="button" className={view === 'active' ? 'active' : ''} onClick={() => { setView('active'); setSearch('') }}><Package size={17} />المنتجات النشطة</button><button type="button" className={view === 'archived' ? 'active' : ''} onClick={() => { setView('archived'); setSearch('') }}><Archive size={17} />المنتجات المؤرشفة</button></div><label className="search-field"><span className="visually-hidden">البحث عن منتج</span><Search size={19} /><input type="search" placeholder="ابحث بأي جزء من اسم المنتج" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" onClick={() => setSearch('')} aria-label="مسح البحث"><X size={17} /></button>}</label></div><ProductList products={visibleProducts} archived={view === 'archived'} onOpen={setDetailsProduct} onEdit={setFormProduct} onArchive={(product) => setConfirmation({ type: 'archive', product })} onReactivate={(product) => setConfirmation({ type: 'reactivate', product })} /></section>{detailsProduct && <ProductDetailsModal product={products.find((product) => product.id === detailsProduct.id) ?? detailsProduct} onClose={() => setDetailsProduct(null)} />}{formProduct !== undefined && <ProductFormModal product={formProduct} products={products} onClose={() => setFormProduct(undefined)} onSubmit={saveProduct} />}{confirmation && <ConfirmationModal title={confirmation.type === 'archive' ? 'تأكيد أرشفة المنتج' : 'تأكيد إعادة تفعيل المنتج'} message={confirmation.type === 'archive' ? `سيُزال المنتج ${confirmation.product.name} من قائمة الاختيار النشطة مع الحفاظ على بياناته وأي معاملات تاريخية تشير إليه.` : `سيعود المنتج ${confirmation.product.name} إلى قائمة المنتجات النشطة مع الحفاظ على بياناته.`} confirmLabel={confirmation.type === 'archive' ? 'أرشفة المنتج' : 'إعادة التفعيل'} onConfirm={completeConfirmation} onClose={() => setConfirmation(null)} />}{toast && <Toast message={toast} onClose={() => setToast(null)} />}</div>
}
