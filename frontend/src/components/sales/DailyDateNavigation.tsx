import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { useRef } from 'react'
import { getArabicWeekday } from '../../utils/date'
import { formatDate } from '../../utils/formatters'

interface DailyDateNavigationProps { selectedDate: string; today: string; onChange: (date: string) => void; onPrevious: () => void; onNext: () => void }

export function DailyDateNavigation({ selectedDate, today, onChange, onPrevious, onNext }: DailyDateNavigationProps) {
  const dateInputRef = useRef<HTMLInputElement>(null)
  const openDatePicker = () => {
    const dateInput = dateInputRef.current
    if (!dateInput) return
    try {
      dateInput.showPicker()
    } catch {
      dateInput.click()
    }
  }

  return <section className="date-navigation" aria-label="التنقل بين أيام سجل المبيعات"><button className="button button--secondary" type="button" onClick={onPrevious}><ChevronRight size={18} />اليوم السابق</button><div className="date-navigation__current"><strong><span>{getArabicWeekday(selectedDate)}</span> <bdi>{formatDate(selectedDate)}</bdi></strong><span className="date-navigation__picker"><button className="icon-button" type="button" aria-label="اختيار تاريخ سجل المبيعات" title="اختيار تاريخ سجل المبيعات" onClick={openDatePicker}><CalendarDays size={20} /></button><input ref={dateInputRef} className="date-navigation__native-picker" type="date" tabIndex={-1} aria-hidden="true" value={selectedDate} onChange={(event) => onChange(event.target.value)} /></span></div><div className="date-navigation__actions"><button className="button button--secondary" type="button" onClick={onNext}>اليوم التالي<ChevronLeft size={18} /></button>{selectedDate !== today && <button className="button button--secondary" type="button" onClick={() => onChange(today)}><RotateCcw size={17} />العودة إلى اليوم</button>}</div></section>
}
