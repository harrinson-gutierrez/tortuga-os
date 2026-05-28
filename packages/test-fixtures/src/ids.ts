let counter = 0
export function nextId(prefix = 'fx'): string {
  counter += 1
  return `${prefix}-${counter.toString().padStart(6, '0')}`
}
export function resetIdCounter(): void {
  counter = 0
}
