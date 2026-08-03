import { CheckCircle2, X } from 'lucide-react'
import { useEffect } from 'react'

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 3500); return () => window.clearTimeout(timer) }, [onClose])
  return <div className="toast" role="status" aria-live="polite"><CheckCircle2 size={20} /><span>{message}</span><button className="icon-button" type="button" onClick={onClose} aria-label="إغلاق الإشعار"><X size={17} /></button></div>
}
