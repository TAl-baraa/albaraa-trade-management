import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

interface ModalProps { title: string; children: ReactNode; onClose: () => void; size?: 'normal' | 'large' }

export function Modal({ title, children, onClose, size = 'normal' }: ModalProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEscape)
    document.body.classList.add('modal-open')
    return () => { document.removeEventListener('keydown', handleEscape); document.body.classList.remove('modal-open') }
  }, [onClose])
  return <div className="modal-layer" role="presentation"><button className="modal-backdrop" type="button" onClick={onClose} aria-label="إغلاق النافذة" /><section className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal__header"><h2 id="modal-title">{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="إغلاق"><X size={21} /></button></header><div className="modal__body">{children}</div></section></div>
}
