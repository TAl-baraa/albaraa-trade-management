import { Archive, Package, Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useRepositoryList } from '../hooks/useRepositoryList'
import { RepositoryStatus } from '../components/common/RepositoryStatus'
import { repositoryError } from '../repositories/tauriBridge'
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
  const { items: products, setItems: setProductsState, loading, error, reload } = useRepositoryList(productRepository.getAll)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<ViewMode>('active')
  const [search, setSearch] = useState('')
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null)
  const [formProduct, setFormProduct] = useState<Product | null | undefined>(undefined)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const visibleProducts = useMemo(() => { const term = search.trim().normalize('NFKC').toLocaleLowerCase('ar'); return products.filter((product) => product.isArchived === (view === 'archived') && (!term || product.name.normalize('NFKC').toLocaleLowerCase('ar').includes(term))) }, [products, search, view])
  const saveProduct = async (values: ProductFormValues) => {
    if (busy) return
    setBusy(true)
    try {
      const input = { name: values.name, notes: values.notes }
      const saved = formProduct ? await productRepository.update(formProduct.id, input) : await productRepository.create(input)
      setProductsState(current => formProduct ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current])
      if (!formProduct) setView('active')
      setFormProduct(undefined)
      setToast('تم حفظ المنتج بنجاح.')
    } catch (reason) { setToast(repositoryError(reason)) }
    finally { setBusy(false) }
  }
  const completeConfirmation = async () => {
    if (!confirmation || busy) return
    setBusy(true)
    try {
      const { product, type } = confirmation

      const saved = type === 'archive' ? await productRepository.archive(product.id) : await productRepository.reactivate(product.id)
      setProductsState(current => current.map(item => item.id === saved.id ? saved : item))

      setConfirmation(null)
      setToast('تم تنفيذ الإجراء بنجاح.')
    } catch (reason) { setToast(repositoryError(reason)) }
    finally { setBusy(false) }
  }
  return <div className="page-container"><header className="page-header"><div><span className="eyebrow">المبيعات</span><h1>إدارة المنتجات</h1><p>تُسجّل المنتجات هنا لتسهيل اختيارها عند إدخال المبيعات.</p></div><button className="button button--primary" type="button" disabled={loading || Boolean(error) || busy} onClick={() => setFormProduct(null)}><Plus size={19} />إضافة منتج</button></header><section className="customers-panel"><div className="toolbar"><div className="view-switch" role="group" aria-label="حالة المنتجات"><button type="button" className={view === 'active' ? 'active' : ''} onClick={() => { setView('active'); setSearch('') }}><Package size={17} />المنتجات النشطة</button><button type="button" className={view === 'archived' ? 'active' : ''} onClick={() => { setView('archived'); setSearch('') }}><Archive size={17} />المنتجات المؤرشفة</button></div><label className="search-field"><span className="visually-hidden">البحث عن منتج</span><Search size={19} /><input type="search" placeholder="ابحث بأي جزء من اسم المنتج" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" onClick={() => setSearch('')} aria-label="مسح البحث"><X size={17} /></button>}</label></div><RepositoryStatus loading={loading} error={error} onRetry={() => void reload()} /><ProductList products={visibleProducts} archived={view === 'archived'} onOpen={setDetailsProduct} onEdit={setFormProduct} onArchive={(product) => setConfirmation({ type: 'archive', product })} onReactivate={(product) => setConfirmation({ type: 'reactivate', product })} /></section>{detailsProduct && <ProductDetailsModal product={products.find((product) => product.id === detailsProduct.id) ?? detailsProduct} onClose={() => setDetailsProduct(null)} />}{formProduct !== undefined && <ProductFormModal product={formProduct} products={products} onClose={() => { if (!busy) setFormProduct(undefined) }} onSubmit={saveProduct} busy={busy} />}{confirmation && <ConfirmationModal title={confirmation.type === 'archive' ? 'تأكيد أرشفة المنتج' : 'تأكيد إعادة تفعيل المنتج'} message={confirmation.type === 'archive' ? `سيُزال المنتج ${confirmation.product.name} من قائمة الاختيار النشطة مع الحفاظ على بياناته وأي معاملات تاريخية تشير إليه.` : `سيعود المنتج ${confirmation.product.name} إلى قائمة المنتجات النشطة مع الحفاظ على بياناته.`} confirmLabel={confirmation.type === 'archive' ? 'أرشفة المنتج' : 'إعادة التفعيل'} onConfirm={completeConfirmation} busy={busy} onClose={() => { if (!busy) setConfirmation(null) }} />}{toast && <Toast message={toast} onClose={() => setToast(null)} />}</div>
}
