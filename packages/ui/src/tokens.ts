/**
 * Tortuga OS design tokens.
 *
 * Single source of truth at runtime: apps/web/src/styles/globals.css.
 * These constants mirror that file so React components can read them
 * without parsing CSS.
 */

export const COLORS = {
  brand: '#f44e5c',
  brandDark: '#c43a47',
  surface: '#0f1115',
  surfaceMuted: '#191c22',
  border: '#262a33',
  textPrimary: '#f2f4f8',
  textMuted: '#9aa0aa',
  success: '#3ddc97',
  warning: '#ffc857',
  danger: '#ff5d5d',
} as const

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

export const RADII = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 9999,
} as const

export const FONTS = {
  sans: '"Inter", system-ui, sans-serif',
  display: '"Bricolage Grotesque", "Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const

export type ColorToken = keyof typeof COLORS
export type SpacingToken = keyof typeof SPACING
export type RadiusToken = keyof typeof RADII
