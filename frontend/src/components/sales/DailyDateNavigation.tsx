import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { formatDate } from '../../utils/formatters'

interface DailyDateNavigationProps { selectedDate: string; today: string; onChange: (date: string) => void; onPrevious: () => void; onNext: () => void }

export function DailyDateNavigation({ selectedDate, today, onChange, onPrevious, onNext }: DailyDateNavigationProps) {
  return <section className="date-navigation" aria-label="التنقل بين أيام سجل المبيعات"><button className="button button--secondary" type="button" onClick={onPrevious}><ChevronRight size={18} />اليوم السابق</button><div className="date-navigation__current"><CalendarDays size={20} /><label><span className="visually-hidden">اختيار تاريخ سجل المبيعات</span><input type="date" value={selectedDate} onChange={(event) => onChange(event.target.value)} /></label><strong>{formatDate(selectedDate)}</strong></div><div className="date-navigation__actions"><button className="button button--secondary" type="button" onClick={onNext}>اليوم التالي<ChevronLeft size={18} /></button>{selectedDate !== today && <button className="button button--secondary" type="button" onClick={() => onChange(today)}><RotateCcw size={17} />العودة إلى اليوم</button>}</div></section>
}
