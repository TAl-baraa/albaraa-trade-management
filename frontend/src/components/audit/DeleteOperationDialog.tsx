import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../customers/Modal'

export function DeleteOperationDialog({ title, description, onConfirm, onClose }: { title: string; description: string; onConfirm: (reason: string) => void | Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const confirm = async () => {
    if (!reason.trim() || saving) return
    setSaving(true)
    try { await onConfirm(reason.trim()) } finally { setSaving(false) }
  }
  const valid = reason.trim().length > 0
  return <Modal title={title} onClose={() => { if (!saving) onClose() }}><div className="confirmation"><Trash2 size={24} /><p>{description}</p></div><label className="field deletion-reason"><span>سبب الحذف</span><textarea required rows={3} disabled={saving} value={reason} onChange={(event) => setReason(event.target.value)} /><small>سبب الحذف مطلوب لحفظ سجل التدقيق.</small></label><div className="modal__footer"><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}>إلغاء</button><button className="button button--danger" type="button" disabled={!valid || saving} onClick={confirm}>تأكيد الحذف</button></div></Modal>
}
