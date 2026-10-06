import { KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { authRepository } from '../../repositories/authRepository'
import { repositoryError } from '../../repositories/tauriBridge'
import { Modal } from '../customers/Modal'

export function ChangePasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!currentPassword) { setError('كلمة المرور الحالية مطلوبة.'); return }
    if (!newPassword) { setError('كلمة المرور الجديدة مطلوبة.'); return }
    if (newPassword.length < 8) { setError('يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف.'); return }
    if (newPassword !== confirmation) { setError('تأكيد كلمة المرور الجديدة غير مطابق.'); return }
    setBusy(true); setError(null)
    try { await authRepository.changePassword(currentPassword, newPassword); onChanged() }
    catch (reason) { setError(repositoryError(reason)) }
    finally { setBusy(false) }
  }

  return <Modal title="تغيير كلمة المرور" onClose={onClose}>
    <form onSubmit={submit}>
      <div className="auth-dialog-heading"><KeyRound size={24} /><p>أدخل كلمة المرور الحالية، ثم اختر كلمة مرور جديدة.</p></div>
      <div className="form-grid">
        <label className="field field--wide"><span>كلمة المرور الحالية</span><input type="password" autoComplete="current-password" autoFocus value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={busy} /></label>
        <label className="field"><span>كلمة المرور الجديدة</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={busy} /></label>
        <label className="field"><span>تأكيد كلمة المرور الجديدة</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label>
      </div>
      {error && <p className="field-error auth-dialog-error" role="alert">{error}</p>}
      <div className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose} disabled={busy}>إلغاء</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور'}</button></div>
    </form>
  </Modal>
}
