import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vite config for Tortuga OS web (UI corre dentro del WebView de Tauri).
// Para desarrollo standalone: npm run dev → localhost:5173.
// En producción Tauri sirve los assets compilados desde dist/.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  // Tauri usa el preview en build mode
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: true,
    chunkSizeWarningLimit: 600,
  },
})
