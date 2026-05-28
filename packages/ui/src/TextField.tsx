import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export function TextField({ label, hint, error, className, id, ...rest }: TextFieldProps) {
  return (
    <label className="block">
      {label && <div className="eyebrow mb-1.5">{label}</div>}
      <input
        id={id}
        {...rest}
        className={cn(
          'w-full h-9 px-3 rounded-md bg-surface-2 border text-[13px] text-text',
          'placeholder:text-text-dim',
          error ? 'border-danger/50' : 'border-border focus:border-border-strong',
          'transition-colors',
          className,
        )}
      />
      {hint && !error && <div className="mt-1 text-[11px] text-text-muted">{hint}</div>}
      {error && <div className="mt-1 text-[11px] text-danger">{error}</div>}
    </label>
  )
}
