import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../customers/Modal'

export function DeleteOperationDialog({ title, description, onConfirm, onClose }: { title: string; description: string; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const valid = reason.trim().length > 0
  return <Modal title={title} onClose={onClose}><div className="confirmation"><Trash2 size={24} /><p>{description}</p></div><label className="field deletion-reason"><span>سبب الحذف</span><textarea required rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /><small>سبب الحذف مطلوب لحفظ سجل التدقيق.</small></label><div className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button--danger" type="button" disabled={!valid} onClick={() => valid && onConfirm(reason.trim())}>تأكيد الحذف</button></div></Modal>
}
