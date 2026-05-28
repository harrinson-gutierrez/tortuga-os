import { cn } from './cn'

export interface DotProps {
  tone?: 'brand' | 'turtle' | 'cyan' | 'violet' | 'amber' | 'success' | 'danger' | 'muted'
  size?: 'xs' | 'sm' | 'md'
  pulse?: boolean
  className?: string
}

const TONES: Record<NonNullable<DotProps['tone']>, string> = {
  brand: 'bg-brand',
  turtle: 'bg-turtle',
  cyan: 'bg-cyan',
  violet: 'bg-violet',
  amber: 'bg-amber',
  success: 'bg-success',
  danger: 'bg-danger',
  muted: 'bg-text-dim',
}

const SIZES: Record<NonNullable<DotProps['size']>, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
}

export function Dot({ tone = 'turtle', size = 'sm', pulse, className }: DotProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full',
        TONES[tone],
        SIZES[size],
        pulse && 'animate-pulse-dot',
        className,
      )}
    />
  )
}
