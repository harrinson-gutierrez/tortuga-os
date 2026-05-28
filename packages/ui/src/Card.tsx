import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** When true uses the slightly darker `bg-bg-alt` instead of `bg-surface`. */
  recessed?: boolean
  /** When true draws a green active border (Figma "HOY"/"JOY" treatment). */
  active?: boolean
  children: ReactNode
}

export function Card({ recessed, active, className, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-card border p-5',
        recessed ? 'bg-bg-alt' : 'bg-surface',
        active ? 'border-turtle/40 shadow-card-active' : 'border-border',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardTight({ recessed, active, className, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-card border px-3.5 py-2.5',
        recessed ? 'bg-bg-alt' : 'bg-surface',
        active ? 'border-turtle/40 shadow-card-active' : 'border-border',
        className,
      )}
    >
      {children}
    </div>
  )
}
