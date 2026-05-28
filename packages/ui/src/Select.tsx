import type { SelectHTMLAttributes } from 'react'
import { cn } from './cn'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: ReadonlyArray<{ value: string; label: string }>
}

export function Select({ label, options, className, ...rest }: SelectProps) {
  return (
    <label className="block">
      {label && <div className="eyebrow mb-1.5">{label}</div>}
      <select
        {...rest}
        className={cn(
          'w-full h-9 px-3 rounded-md bg-surface-2 border border-border text-[13px] text-text',
          'focus:border-border-strong transition-colors',
          className,
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface text-text">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
