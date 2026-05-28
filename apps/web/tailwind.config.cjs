/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@tortuga-os/tailwind-preset/preset.cjs')],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/ui-flows/src/**/*.{ts,tsx}',
  ],
}
