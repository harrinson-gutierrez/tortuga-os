import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

export interface ResizableRightbarProps {
  /** localStorage key used to persist the width across reloads. */
  storageKey?: string
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  children: ReactNode
}

/**
 * Right-anchored sidebar that the user can resize by dragging its left
 * edge. Width is clamped to [minWidth, maxWidth] and persisted in
 * localStorage so the choice survives reloads.
 */
export function ResizableRightbar({
  storageKey = 'tortuga.rightbar.width',
  defaultWidth = 420,
  minWidth = 300,
  maxWidth = 900,
  children,
}: ResizableRightbarProps) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultWidth
    const saved = window.localStorage.getItem(storageKey)
    if (!saved) return defaultWidth
    const n = Number.parseInt(saved, 10)
    if (Number.isNaN(n)) return defaultWidth
    return clamp(n, minWidth, maxWidth)
  })

  const draggingRef = useRef(false)
  const widthRef = useRef(width)
  widthRef.current = width

  // Persist width when it settles.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, String(width))
  }, [storageKey, width])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      draggingRef.current = true
      const startX = e.clientX
      const startW = widthRef.current
      // Capture pointer so the drag keeps tracking even off the handle.
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)

      function onMove(ev: PointerEvent) {
        if (!draggingRef.current) return
        // The handle is on the LEFT edge of the rightbar. Moving the
        // mouse left INCREASES the rightbar width.
        const delta = startX - ev.clientX
        setWidth(clamp(startW + delta, minWidth, maxWidth))
      }
      function onUp(ev: PointerEvent) {
        draggingRef.current = false
        try {
          target.releasePointerCapture(ev.pointerId)
        } catch {
          /* already released */
        }
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [minWidth, maxWidth],
  )

  return (
    <aside
      className="flex-shrink-0 border-l border-border bg-bg overflow-y-auto relative"
      style={{ width: `${width}px` }}
    >
      {/* Drag handle on the left edge. 6px wide, full height. Hover
          highlights it so the affordance is visible. */}
      <div
        onPointerDown={onPointerDown}
        className="absolute top-0 left-0 h-full w-[6px] -translate-x-[3px] cursor-col-resize hover:bg-brand/40 active:bg-brand/60 z-10"
        title="Arrastra para redimensionar"
      />
      {children}
    </aside>
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}
