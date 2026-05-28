import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Dot, type DotProps } from './Dot'
import { cn } from './cn'

export interface NavItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Label shown on the left. */
  label: ReactNode
  /** Optional count / status shown on the right. */
  right?: ReactNode
  /** When set, renders a leading dot of the given tone. */
  dot?: DotProps['tone']
  active?: boolean
}

export function NavItem({ label, right, dot, active, className, ...rest }: NavItemProps) {
  return (
    <button
      {...rest}
      className={cn(
        'group w-full flex items-center justify-between gap-2 h-8 px-2.5 rounded-md text-left transition-colors',
        active ? 'bg-surface-2 ring-1 ring-turtle/40' : 'hover:bg-surface-2 ring-0',
        className,
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        {dot && <Dot tone={dot} size="xs" />}
        <span
          className={cn(
            'text-[13px] truncate',
            active ? 'text-text' : 'text-text-soft group-hover:text-text',
          )}
        >
          {label}
        </span>
      </span>
      {right !== undefined && (
        <span
          className={cn(
            'text-[11px] font-mono shrink-0',
            active ? 'text-turtle' : 'text-text-muted',
          )}
        >
          {right}
        </span>
      )}
    </button>
  )
}
