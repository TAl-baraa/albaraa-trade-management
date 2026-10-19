import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps { title: string; children: ReactNode; onClose: () => void; size?: 'normal' | 'large' }

export function Modal({ title, children, onClose, size = 'normal' }: ModalProps) {
  const modalRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', handleEscape)
    document.body.classList.add('modal-open')
    requestAnimationFrame(() => modalRef.current?.querySelector<HTMLElement>('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')?.focus())
    return () => { document.removeEventListener('keydown', handleEscape); document.body.classList.remove('modal-open'); previousFocus?.focus() }
  }, [])
  return <div className="modal-layer" role="presentation"><button className="modal-backdrop" type="button" onClick={onClose} aria-label="إغلاق النافذة" /><section ref={modalRef} className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal__header"><h2 id="modal-title">{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="إغلاق"><X size={21} /></button></header><div className="modal__body">{children}</div></section></div>
}
