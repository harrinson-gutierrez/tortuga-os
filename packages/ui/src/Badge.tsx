import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'brand' | 'turtle' | 'success' | 'warning' | 'danger' | 'cyan' | 'violet'
  outline?: boolean
  children: ReactNode
}

const SOLID: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-surface-3 text-text-soft',
  brand: 'bg-brand text-white',
  turtle: 'bg-turtle/15 text-turtle',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  cyan: 'bg-cyan/15 text-cyan',
  violet: 'bg-violet/15 text-violet',
}

const OUTLINE: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'border border-border text-text-muted',
  brand: 'border border-brand/40 text-brand',
  turtle: 'border border-turtle/40 text-turtle',
  success: 'border border-success/40 text-success',
  warning: 'border border-warning/40 text-warning',
  danger: 'border border-danger/40 text-danger',
  cyan: 'border border-cyan/40 text-cyan',
  violet: 'border border-violet/40 text-violet',
}

export function Badge({ tone = 'neutral', outline, className, children, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium leading-none',
        outline ? OUTLINE[tone] : SOLID[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
