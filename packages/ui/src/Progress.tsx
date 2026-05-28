import { cn } from './cn'

export interface ProgressProps {
  /** 0..1 */
  value: number
  tone?: 'brand' | 'turtle' | 'cyan' | 'violet' | 'amber'
  className?: string
}

const FILLS: Record<NonNullable<ProgressProps['tone']>, string> = {
  brand: 'bg-brand',
  turtle: 'bg-turtle',
  cyan: 'bg-cyan',
  violet: 'bg-violet',
  amber: 'bg-amber',
}

export function Progress({ value, tone = 'brand', className }: ProgressProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={cn('h-1 w-full rounded-full bg-surface-3 overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all', FILLS[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
