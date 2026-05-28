/**
 * Tortuga OS — Tailwind preset.
 *
 * Source of truth for design tokens at runtime. Mirrors the Figma A canvas
 * shell unificado spec and the Tortuga OS brandbook.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        // surfaces (dark only)
        bg: '#0a0a0d',
        'bg-alt': '#0c0c11',
        surface: '#111116',
        'surface-2': '#15151c',
        'surface-3': '#1a1a23',

        // borders
        border: 'rgba(255,255,255,0.06)',
        'border-strong': 'rgba(255,255,255,0.12)',
        'border-active': 'rgba(74,222,128,0.35)',

        // text
        text: '#ededf0',
        'text-soft': '#c8c8d1',
        'text-muted': '#8b8b96',
        'text-dim': '#5a5a66',

        // Tortuga identity
        turtle: {
          DEFAULT: '#4ade80',
          glow: '#80f29f',
          dim: '#2f6f48',
        },

        // brand (#f44e5c)
        brand: {
          DEFAULT: '#f44e5c',
          glow: '#ff6b7a',
          dim: '#7a2730',
        },

        // accents for project dots / charts
        cyan: '#22d3ee',
        violet: '#a855f7',
        lime: '#d4ff4f',
        amber: '#fbbf24',
        success: '#22c55e',
        danger: '#ff5d5d',
        warning: '#fbbf24',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        'tighter-2': '-0.025em',
        eyebrow: '0.16em',
      },
      borderRadius: {
        card: '12px',
        pill: '9999px',
      },
      backgroundImage: {
        'grad-brand': 'linear-gradient(135deg, #f44e5c 0%, #fbbf24 100%)',
        'grad-cool': 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        'grad-turtle': 'linear-gradient(135deg, #4ade80 0%, #22d3ee 100%)',
      },
      boxShadow: {
        'card-glow': '0 0 0 1px rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.4)',
        'card-active': '0 0 0 1px rgba(74,222,128,0.35), 0 0 24px rgba(74,222,128,0.05)',
      },
      animation: {
        'pulse-dot': 'pulseDot 2s cubic-bezier(0.22, 1, 0.36, 1) infinite',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
}
