import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

interface ConfirmationModalProps { title: string; message: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void; onClose: () => void }

export function ConfirmationModal({ title, message, confirmLabel, destructive, onConfirm, onClose }: ConfirmationModalProps) {
  return <Modal title={title} onClose={onClose}><div className="confirmation"><AlertTriangle size={30} aria-hidden="true" /><p>{message}</p></div><div className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>إلغاء</button><button className={`button ${destructive ? 'button--danger' : 'button--primary'}`} type="button" onClick={onConfirm}>{confirmLabel}</button></div></Modal>
}
