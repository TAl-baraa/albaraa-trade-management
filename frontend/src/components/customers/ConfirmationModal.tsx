import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

interface ConfirmationModalProps { title: string; message: string; confirmLabel: string; destructive?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }

export function ConfirmationModal({ title, message, confirmLabel, destructive, onConfirm, onClose, busy = false }: ConfirmationModalProps) {
  return <Modal title={title} onClose={onClose}><div className="confirmation"><AlertTriangle size={30} aria-hidden="true" /><p>{message}</p></div><div className="modal__footer"><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>إلغاء</button><button className={`button ${destructive ? 'button--danger' : 'button--primary'}`} type="button" disabled={busy} onClick={onConfirm}>{confirmLabel}</button></div></Modal>
}
