import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { filterDriverNameSuggestions } from '../../utils/driverNames'

interface DriverNameAutocompleteProps { value: string; suggestions: string[]; error?: string; onChange: (value: string) => void }

export function DriverNameAutocomplete({ value, suggestions, error, onChange }: DriverNameAutocompleteProps) {
  const inputId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const filtered = useMemo(() => filterDriverNameSuggestions(suggestions, value), [suggestions, value])
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [])
  useEffect(() => { setHighlightedIndex(0) }, [value])
  const select = (name: string) => { onChange(name); setOpen(false); setHighlightedIndex(0) }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return }
    if (event.key === 'Tab') { setOpen(false); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) { setOpen(true); setHighlightedIndex(0) } else setHighlightedIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0))); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); if (!open) { setOpen(true); setHighlightedIndex(Math.max(filtered.length - 1, 0)) } else setHighlightedIndex((index) => Math.max(index - 1, 0)); return }
    if (event.key === 'Enter' && open) { event.preventDefault(); event.stopPropagation(); const name = filtered[highlightedIndex]; if (name) select(name) }
  }
  return <div className="field predictive-field predictive-field--compact" ref={rootRef}><label className="visually-hidden" htmlFor={inputId}>اسم السائق <b aria-hidden="true">*</b></label><div className="predictive-control"><input id={inputId} type="text" role="combobox" aria-expanded={open} aria-controls={`${inputId}-options`} aria-activedescendant={open && filtered[highlightedIndex] ? `${inputId}-option-${highlightedIndex}` : undefined} aria-autocomplete="list" autoComplete="off" placeholder="اسم السائق" value={value} aria-invalid={Boolean(error)} onFocus={() => setOpen(true)} onKeyDown={handleKeyDown} onChange={(event) => { onChange(event.target.value); setOpen(true) }} /><ChevronDown size={17} aria-hidden="true" /></div>{open && <div className="predictive-options" id={`${inputId}-options`} role="listbox">{filtered.length > 0 ? filtered.map((name, index) => <button id={`${inputId}-option-${index}`} type="button" role="option" aria-selected={index === highlightedIndex} key={name} onPointerMove={() => setHighlightedIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => select(name)}>{name}</button>) : <span>لا توجد أسماء مطابقة.</span>}</div>}{error && <small className="field-error">{error}</small>}</div>
}
