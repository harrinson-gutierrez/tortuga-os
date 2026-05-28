import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

const GAPS = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
} as const

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column'
  gap?: keyof typeof GAPS
  align?: CSSProperties['alignItems']
  justify?: CSSProperties['justifyContent']
  children: ReactNode
}

export function Stack({
  direction = 'column',
  gap = 'md',
  align,
  justify,
  className,
  style,
  children,
  ...rest
}: StackProps) {
  return (
    <div
      {...rest}
      className={cn('flex', direction === 'row' ? 'flex-row' : 'flex-col', GAPS[gap], className)}
      style={{ alignItems: align, justifyContent: justify, ...style }}
    >
      {children}
    </div>
  )
}
