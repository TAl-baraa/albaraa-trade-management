import { ArchiveRestore, Clock3, FolderOpen, HardDrive, RefreshCw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { backupRepository, type BackupSettings } from '../repositories/backupRepository'
import { repositoryError } from '../repositories/tauriBridge'
import { formatDateTime } from '../utils/formatters'

interface BackupSettingsPageProps {
  onRestored: () => void
}

export function BackupSettingsPage({ onRestored }: BackupSettingsPageProps) {
  const [settings, setSettings] = useState<BackupSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try { setSettings(await backupRepository.getSettings()) }
    catch (reason) { setError(repositoryError(reason)) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const chooseDirectory = async () => {
    setError(null); setMessage(null)
    try {
      const selected = await backupRepository.selectDirectory()
      if (!selected) return
      setBusy(true)
      setSettings(await backupRepository.configureDirectory(selected))
      setMessage('تم حفظ مجلد النسخ الاحتياطي بنجاح.')
    } catch (reason) { setError(repositoryError(reason)) }
    finally { setBusy(false) }
  }

  const createBackup = async () => {
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await backupRepository.createManual()
      setSettings((current) => current ? { ...current, lastSuccessfulBackupAt: result.completedAt } : current)
      setMessage(`تم إنشاء النسخة الاحتياطية والتحقق منها: ${result.path}`)
    } catch (reason) { setError(repositoryError(reason)) }
    finally { setBusy(false) }
  }

  const restore = async () => {
    setError(null); setMessage(null)
    try {
      const selected = await backupRepository.selectBackupFile()
      if (!selected) return
      if (!window.confirm('ستُستبدل البيانات الحالية بمحتوى النسخة المحددة بعد إنشاء نسخة أمان تلقائية. هل تريد المتابعة؟')) return
      setBusy(true)
      await backupRepository.restore(selected)
      onRestored()
    } catch (reason) { setError(repositoryError(reason)); setBusy(false) }
  }

  return <div className="page-container backup-page">
    <header className="page-header"><div><span className="eyebrow">الإعدادات المحلية</span><h1>النسخ الاحتياطي والاستعادة</h1><p>احفظ نسخة كاملة من بيانات النظام في أي مجلد محلي قابل للكتابة.</p></div><button className="button button--secondary" type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={18} />تحديث</button></header>
    <section className="backup-card">
      <div className="backup-card__heading"><HardDrive size={28} /><div><h2>مجلد النسخ الاحتياطي</h2><p>يمكن أن يكون مجلدًا محليًا أو وحدة USB أو مجلدًا تزامنه خدمة سحابية على الجهاز.</p></div></div>
      {loading ? <p role="status">جارٍ تحميل إعدادات النسخ الاحتياطي...</p> : <>
        <dl className="backup-details"><div><dt>المجلد الحالي</dt><dd dir="ltr">{settings?.backupDirectory ?? 'لم يتم اختيار مجلد بعد'}</dd></div><div><dt>آخر نسخة ناجحة</dt><dd>{formatDateTime(settings?.lastSuccessfulBackupAt ?? null)}</dd></div></dl>
        <section className="automatic-backup-summary" aria-labelledby="automatic-backup-title">
          <div className="automatic-backup-summary__heading"><Clock3 size={22} /><div><h3 id="automatic-backup-title">النسخ الاحتياطي التلقائي</h3><p>يعمل أثناء تشغيل التطبيق فقط.</p></div><span className={`status-badge ${settings?.automaticBackupAvailable ? 'status-badge--active' : 'status-badge--unavailable'}`}>{settings?.automaticBackupAvailable ? 'مفعّل' : 'غير متاح'}</span></div>
          <dl><div><dt>الفاصل الزمني</dt><dd>كل 3 ساعات</dd></div><div><dt>آخر نسخة تلقائية ناجحة</dt><dd>{formatDateTime(settings?.lastSuccessfulAutoBackupAt ?? null)}</dd></div><div><dt>النسخ التلقائية المحتفظ بها</dt><dd>{settings?.automaticBackupCount ?? 0} من 20</dd></div></dl>
          {settings?.automaticBackupWarning && <p className="backup-warning" role="status">{settings.automaticBackupWarning}</p>}
        </section>
        <div className="backup-actions">
          <button className="button button--secondary" type="button" onClick={() => void chooseDirectory()} disabled={busy}><FolderOpen size={18} />{settings?.backupDirectory ? 'تغيير المجلد' : 'اختر مجلد النسخ الاحتياطي'}</button>
          <button className="button button--secondary" type="button" onClick={() => settings?.backupDirectory && void backupRepository.openDirectory(settings.backupDirectory).catch((reason) => setError(repositoryError(reason)))} disabled={busy || !settings?.backupDirectory}><FolderOpen size={18} />فتح مجلد النسخ الاحتياطي</button>
          <button className="button button--primary" type="button" onClick={() => void createBackup()} disabled={busy || !settings?.backupDirectory}><Save size={18} />إنشاء نسخة احتياطية الآن</button>
          <button className="button button--danger" type="button" onClick={() => void restore()} disabled={busy}><ArchiveRestore size={18} />استعادة نسخة احتياطية</button>
        </div>
      </>}
      {busy && <p className="backup-status" role="status">جارٍ تنفيذ العملية بأمان. يرجى الانتظار...</p>}
      {message && <p className="backup-success" role="status">{message}</p>}
      {error && <p className="backup-error" role="alert">{error}</p>}
    </section>
  </div>
}
