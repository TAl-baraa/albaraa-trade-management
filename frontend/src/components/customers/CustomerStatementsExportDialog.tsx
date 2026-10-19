import { CheckSquare, FolderOpen, LoaderCircle, Printer, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { receiptRepository } from '../../repositories/receiptRepository'
import { saleRepository } from '../../repositories/saleRepository'
import { statementPdfRepository } from '../../repositories/statementPdfRepository'
import { repositoryError } from '../../repositories/tauriBridge'
import { transferRepository } from '../../repositories/transferRepository'
import { buildStatementExportQueue, runStatementExportQueue, selectAllActiveCustomers, toggleCustomerSelection, validateStatementDateRange, type StatementExportQueueItem, type StatementExportResult } from '../../services/customerStatementBatchExport'
import type { Customer } from '../../types/customer'
import { PrintableCustomerStatement } from './PrintableCustomerStatement'
import { Modal } from './Modal'

interface RenderWaiter { key: string; resolve: () => void; reject: (reason: Error) => void }
interface ProgressState { completed: number; total: number; successful: number; skipped: number; failed: number; current: StatementExportQueueItem | null }

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))

export function CustomerStatementsExportDialog({ customers, onClose }: { customers: Customer[]; onClose: () => void }) {
  const activeCustomers = customers.filter((customer) => !customer.isArchived)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [phase, setPhase] = useState<'selection' | 'loading' | 'exporting' | 'result'>('selection')
  const [message, setMessage] = useState<string | null>(null)
  const [renderedItem, setRenderedItem] = useState<StatementExportQueueItem | null>(null)
  const [progress, setProgress] = useState<ProgressState>({ completed: 0, total: 0, successful: 0, skipped: 0, failed: 0, current: null })
  const [result, setResult] = useState<StatementExportResult | null>(null)
  const [folderPath, setFolderPath] = useState('')
  const [openError, setOpenError] = useState<string | null>(null)
  const waiterRef = useRef<RenderWaiter | null>(null)
  const exportActiveRef = useRef(false)
  const printSourceRef = useRef<HTMLDivElement>(null)
  const locked = phase === 'loading' || phase === 'exporting'
  const allSelected = activeCustomers.length > 0 && selectedIds.size === activeCustomers.length

  useEffect(() => () => waiterRef.current?.reject(new Error('تم إيقاف تجهيز كشف الحساب قبل اكتمال عرضه.')), [])

  const acknowledgeRendered = async (key: string) => {
    try {
      await nextFrame()
      await nextFrame()
      await document.fonts.ready
      const waiter = waiterRef.current
      if (!waiter || waiter.key !== key || printSourceRef.current?.dataset.statementKey !== key) return
      waiterRef.current = null
      waiter.resolve()
    } catch (reason) {
      const waiter = waiterRef.current
      if (!waiter || waiter.key !== key) return
      waiterRef.current = null
      waiter.reject(reason instanceof Error ? reason : new Error('تعذر تجهيز كشف الحساب للطباعة.'))
    }
  }

  const prepareStatement = (item: StatementExportQueueItem): Promise<void> => new Promise((resolve, reject) => {
    waiterRef.current = { key: item.key, resolve, reject }
    setRenderedItem(item)
  })

  const startExport = async () => {
    if (exportActiveRef.current) return
    setMessage(null); setOpenError(null); setFolderPath('')
    if (selectedIds.size === 0) { setMessage('اختر زبونًا واحدًا على الأقل.'); return }
    const dateError = validateStatementDateRange(startDate, endDate)
    if (dateError) { setMessage(dateError); return }
    exportActiveRef.current = true
    setPhase('loading')
    try {
      const [sales, receipts, transfers] = await Promise.all([saleRepository.getAll(), receiptRepository.getAll(), transferRepository.getAll()])
      const prepared = buildStatementExportQueue({ customers: activeCustomers, selectedCustomerIds: selectedIds, sales, receipts, transfers, startDate: startDate || null, endDate: endDate || null })
      if (prepared.queue.length === 0) {
        setProgress({ completed: 0, total: 0, successful: 0, skipped: prepared.skipped, failed: 0, current: null })
        setResult({ folderPath: '', successful: 0, skipped: prepared.skipped, failures: [], finalizationError: null })
        setMessage('لا توجد كشوف مؤهلة للتصدير ضمن الفترة المحددة، لذلك لم يُنشأ مجلد على سطح المكتب.')
        setPhase('result')
        exportActiveRef.current = false
        return
      }
      setProgress({ completed: 0, total: prepared.queue.length, successful: 0, skipped: prepared.skipped, failed: 0, current: prepared.queue[0] })
      setPhase('exporting')
      const exportResult = await runStatementExportQueue(prepared.queue, prepared.skipped, {
        createBatch: statementPdfRepository.createBatch,
        prepare: prepareStatement,
        exportPdf: async (batchId, item) => { await statementPdfRepository.exportToBatch(batchId, item.customer.name, item.currency) },
        finishBatch: statementPdfRepository.finishBatch,
        onBatchCreated: (batch) => setFolderPath(batch.folderPath),
        onProgress: (completed, item, successful, failed) => setProgress({ completed, total: prepared.queue.length, successful, skipped: prepared.skipped, failed, current: item }),
      })
      setResult(exportResult)
      setProgress((current) => ({ ...current, completed: prepared.queue.length, successful: exportResult.successful, failed: exportResult.failures.length, current: null }))
      setRenderedItem(null)
      setPhase('result')
      exportActiveRef.current = false
    } catch (reason) {
      setRenderedItem(null)
      setMessage(repositoryError(reason))
      setPhase('selection')
      exportActiveRef.current = false
    }
  }

  const openFolder = async () => {
    if (!result?.folderPath) return
    setOpenError(null)
    try { await statementPdfRepository.open(result.folderPath) }
    catch (reason) { setOpenError(repositoryError(reason)) }
  }

  const selection = <>
    <div className="statement-export-dates"><label>من<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label><label>إلى<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label></div>
    <div className="statement-export-selection"><button type="button" className="statement-export-select-all" onClick={() => setSelectedIds(selectAllActiveCustomers(activeCustomers, !allSelected))}>{allSelected ? <CheckSquare size={18} /> : <Square size={18} />}تحديد الكل</button><span>تم اختيار {selectedIds.size} من {activeCustomers.length}</span></div>
    <div className="statement-export-customers">{activeCustomers.length === 0 ? <p className="empty-state">لا يوجد زبائن نشطون.</p> : activeCustomers.map((customer) => <label key={customer.id}><input type="checkbox" checked={selectedIds.has(customer.id)} onChange={(event) => setSelectedIds((current) => toggleCustomerSelection(current, customer.id, event.target.checked))} /><span>{customer.name}</span></label>)}</div>
    {message && <p className="field-error">{message}</p>}
    <div className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button--primary" type="button" onClick={() => void startExport()}><Printer size={18} />إنشاء ملفات PDF</button></div>
  </>

  const progressView = <div className="statement-export-progress"><LoaderCircle className="spinning" size={28} /><h3>{phase === 'loading' ? 'جارٍ تحميل بيانات الحسابات...' : 'جارٍ إنشاء كشوف الحساب...'}</h3>{folderPath && <p className="statement-export-path" dir="ltr">{folderPath}</p>}{progress.current && <p>{progress.current.customer.name} — {progress.current.currency === 'IQD' ? 'دينار' : 'دولار'}</p>}<strong>تم إنشاء {progress.completed} من {progress.total}</strong><dl><div><dt>ناجح</dt><dd>{progress.successful}</dd></div><div><dt>متخطى</dt><dd>{progress.skipped}</dd></div><div><dt>فشل</dt><dd>{progress.failed}</dd></div></dl></div>

  const resultView = result && <div className="statement-export-result">{message && <p>{message}</p>}{result.folderPath && <><span>تم حفظ الملفات في:</span><strong className="statement-export-path" dir="ltr">{result.folderPath}</strong></>}<dl><div><dt>الملفات الناجحة</dt><dd>{result.successful}</dd></div><div><dt>المتخطاة</dt><dd>{result.skipped}</dd></div><div><dt>الفاشلة</dt><dd>{result.failures.length}</dd></div></dl>{result.failures.length > 0 && <div className="statement-export-failures"><h3>الكشوف التي تعذر إنشاؤها</h3>{result.failures.map((failure) => <p key={failure.key}><strong>{failure.customerName} — {failure.currency === 'IQD' ? 'دينار' : 'دولار'}</strong><span>{failure.reason}</span></p>)}</div>}{result.finalizationError && <p className="field-error">تعذر إنهاء جلسة التصدير: {result.finalizationError}</p>}{openError && <p className="field-error">{openError}</p>}<div className="modal__footer">{result.folderPath && <button className="button button--secondary" type="button" onClick={() => void openFolder()}><FolderOpen size={18} />فتح المجلد</button>}<button className="button button--primary" type="button" onClick={onClose}>إغلاق</button></div></div>

  return <><Modal title="طباعة كشوفات الزبائن" onClose={locked ? () => undefined : onClose} size="large">{phase === 'selection' ? selection : locked ? progressView : resultView}</Modal>{renderedItem && createPortal(<div ref={printSourceRef} className="print-only-source" data-statement-key={renderedItem.key}><PrintableCustomerStatement customer={renderedItem.customer} statement={renderedItem.statement} /><RenderAcknowledgement statementKey={renderedItem.key} onReady={acknowledgeRendered} /></div>, document.body)}</>
}

function RenderAcknowledgement({ statementKey, onReady }: { statementKey: string; onReady: (key: string) => void | Promise<void> }) {
  useEffect(() => { void onReady(statementKey) }, [onReady, statementKey])
  return null
}
