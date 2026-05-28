import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface EyebrowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Eyebrow({ className, children, ...rest }: EyebrowProps) {
  return (
    <div {...rest} className={cn('eyebrow', className)}>
      {children}
    </div>
  )
}
