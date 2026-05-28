import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'turtle'
  size?: 'sm' | 'md'
  children: ReactNode
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand text-white hover:bg-brand-glow active:bg-brand-dim disabled:opacity-50',
  secondary:
    'bg-surface-2 text-text border border-border hover:bg-surface-3 hover:border-border-strong disabled:opacity-50',
  ghost: 'text-text-soft hover:text-text hover:bg-surface-2 disabled:opacity-50',
  turtle:
    'bg-turtle/15 text-turtle border border-turtle/30 hover:bg-turtle/25 hover:border-turtle/50 disabled:opacity-50',
}

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-7 px-2.5 text-[12px]',
  md: 'h-9 px-3.5 text-[13px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium leading-none',
        'transition-colors duration-150',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
    </button>
  )
}
