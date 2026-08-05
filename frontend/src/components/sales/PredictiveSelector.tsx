import { ChevronDown, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export interface PredictiveOption { id: string; name: string }
interface PredictiveSelectorProps { label: string; placeholder: string; options: PredictiveOption[]; value: string; error?: string; compact?: boolean; onChange: (id: string) => void }

const normalizeSearch = (value: string): string => value.trim().normalize('NFKC').toLocaleLowerCase('en-US')

export function PredictiveSelector({ label, placeholder, options, value, error, compact = false, onChange }: PredictiveSelectorProps) {
  const inputId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedName = options.find((option) => option.id === value)?.name ?? ''
  const [query, setQuery] = useState(selectedName)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  useEffect(() => { setQuery(selectedName) }, [selectedName, value])
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [])
  const filtered = useMemo(() => { const term = normalizeSearch(query); return options.filter((option) => !term || normalizeSearch(option.name).includes(term)).slice(0, 8) }, [options, query])
  useEffect(() => { setHighlightedIndex(0) }, [query])
  const select = (option: PredictiveOption) => { onChange(option.id); setQuery(option.name); setOpen(false); setHighlightedIndex(0) }
  const clear = () => { onChange(''); setQuery(''); setOpen(true) }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return }
    if (event.key === 'Tab') { setOpen(false); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) { setOpen(true); setHighlightedIndex(0) } else setHighlightedIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0))); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); if (!open) { setOpen(true); setHighlightedIndex(Math.max(filtered.length - 1, 0)) } else setHighlightedIndex((index) => Math.max(index - 1, 0)); return }
    if (event.key === 'Enter' && open) { event.preventDefault(); event.stopPropagation(); const option = filtered[highlightedIndex]; if (option) select(option) }
  }
  return <div className={`field predictive-field ${compact ? 'predictive-field--compact' : ''}`} ref={rootRef}><label className={compact ? 'visually-hidden' : undefined} htmlFor={inputId}>{label} <b aria-hidden="true">*</b></label><div className="predictive-control"><input id={inputId} role="combobox" aria-expanded={open} aria-controls={`${inputId}-options`} aria-activedescendant={open && filtered[highlightedIndex] ? `${inputId}-option-${highlightedIndex}` : undefined} aria-autocomplete="list" autoComplete="off" placeholder={placeholder} value={query} aria-invalid={Boolean(error)} onFocus={() => setOpen(true)} onKeyDown={handleKeyDown} onChange={(event) => { setQuery(event.target.value); onChange(''); setOpen(true) }} />{query ? <button type="button" onClick={clear} aria-label={`مسح ${label}`}><X size={16} /></button> : <ChevronDown size={17} aria-hidden="true" />}</div>{open && <div className="predictive-options" id={`${inputId}-options`} role="listbox">{filtered.length > 0 ? filtered.map((option, index) => <button id={`${inputId}-option-${index}`} type="button" role="option" aria-selected={index === highlightedIndex} key={option.id} onPointerMove={() => setHighlightedIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => select(option)}>{option.name}</button>) : <span>لا توجد نتائج مطابقة.</span>}</div>}{error && <small className="field-error">{error}</small>}</div>
}
