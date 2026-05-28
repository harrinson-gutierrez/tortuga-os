import type { MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'

export interface CorsConfig {
  isDev: boolean
}

function isAllowed(isDev: boolean, origin: string): boolean {
  if (
    origin.startsWith('tauri://') ||
    origin.startsWith('http://tauri.localhost') ||
    origin.startsWith('https://tauri.localhost')
  ) {
    return true
  }
  if (isDev) {
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return true
    }
  }
  return false
}

export function corsMiddleware(config: CorsConfig): MiddlewareHandler {
  return cors({
    origin: (origin) => {
      if (!origin) return '*'
      return isAllowed(config.isDev, origin) ? origin : null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Tortuga-Secret'],
  })
}
