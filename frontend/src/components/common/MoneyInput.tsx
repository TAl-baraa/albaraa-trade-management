import { useLayoutEffect, useRef, type RefObject } from 'react'
import { formatMoneyInput, normalizeMoneyInput } from '../../utils/money'

interface MoneyInputProps {
  value: string
  label: string
  placeholder: string
  invalid: boolean
  focusRef?: RefObject<HTMLInputElement | null>
  onChange: (value: string) => void
}

const semanticLength = (value: string): number => value.replace(/[^\d.]/g, '').length
const caretFromSemanticPosition = (value: string, position: number): number => {
  if (position <= 0) return 0
  let semanticPosition = 0
  for (let index = 0; index < value.length; index += 1) {
    if (/[\d.]/.test(value[index])) semanticPosition += 1
    if (semanticPosition === position) return index + 1
  }
  return value.length
}

export function MoneyInput({ value, label, placeholder, invalid, focusRef, onChange }: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const displayValue = formatMoneyInput(value)
  const setInputRef = (element: HTMLInputElement | null) => { inputRef.current = element; if (focusRef) focusRef.current = element }
  useLayoutEffect(() => {
    if (pendingCaret.current === null || document.activeElement !== inputRef.current) return
    const position = caretFromSemanticPosition(displayValue, pendingCaret.current)
    inputRef.current?.setSelectionRange(position, position)
    pendingCaret.current = null
  }, [displayValue])
  const commitDisplayValue = (nextDisplay: string, caret: number) => {
    const normalized = normalizeMoneyInput(nextDisplay)
    if (normalized === null) return
    pendingCaret.current = semanticLength(nextDisplay.slice(0, caret))
    onChange(normalized)
  }
  return <label className="inline-field"><span className="visually-hidden">{label}</span><input ref={setInputRef} type="text" inputMode="decimal" autoComplete="off" dir="ltr" placeholder={placeholder} value={displayValue} aria-invalid={invalid} onChange={(event) => commitDisplayValue(event.target.value, event.target.selectionStart ?? event.target.value.length)} onKeyDown={(event) => {
    const input = event.currentTarget
    if (input.selectionStart !== input.selectionEnd || input.selectionStart === null) return
    const caret = input.selectionStart
    if (event.key === 'Backspace' && displayValue[caret - 1] === ',') {
      event.preventDefault()
      const digitIndex = caret - 2
      if (digitIndex >= 0) commitDisplayValue(`${displayValue.slice(0, digitIndex)}${displayValue.slice(digitIndex + 1)}`, digitIndex)
    } else if (event.key === 'Delete' && displayValue[caret] === ',') {
      event.preventDefault()
      const digitIndex = caret + 1
      if (digitIndex < displayValue.length) commitDisplayValue(`${displayValue.slice(0, digitIndex)}${displayValue.slice(digitIndex + 1)}`, caret)
    }
  }} /></label>
}
