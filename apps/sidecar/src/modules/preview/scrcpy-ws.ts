import type { UpgradeWebSocket, WSContext } from 'hono/ws'
import { logger } from '../../shared/logger'
import { type ScrcpySession, openScrcpySession } from './scrcpy-bridge'

/**
 * WebSocket bridge for the interactive emulator panel.
 *
 * Wire protocol:
 *   sidecar → webview (binary): [1 byte type][payload]
 *     type 0 = codec configuration packet
 *     type 1 = H.264 data packet
 *   webview → sidecar (text JSON): control intents
 *     { kind: 'touch', action, x, y, videoWidth, videoHeight, pressure }
 *     { kind: 'key', action, keyCode, metaState, repeat }
 *
 * The handshake token is validated by the same middleware as HTTP routes via
 * the `?_secret=` query param (EventSource/WebSocket cannot send headers).
 */

const TYPE_CONFIGURATION = 0
const TYPE_DATA = 1

interface TouchMessage {
  kind: 'touch'
  action: number
  x: number
  y: number
  videoWidth: number
  videoHeight: number
  pressure: number
}

interface KeyMessage {
  kind: 'key'
  action: number
  keyCode: number
  metaState: number
  repeat: number
}

type ControlMessage = TouchMessage | KeyMessage

function frame(type: number, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(data.length + 1))
  out[0] = type
  out.set(data, 1)
  return out
}

/** Pump the session's video packets to the socket until it closes. */
async function pumpVideo(session: ScrcpySession, ws: WSContext): Promise<void> {
  const reader = session.video.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const type = value.type === 'configuration' ? TYPE_CONFIGURATION : TYPE_DATA
      // A closed webview socket must not throw out of the pump and crash the
      // process; stop pumping instead.
      try {
        ws.send(frame(type, value.data))
      } catch {
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** Returns false when the control socket is dead so the caller closes the WS. */
async function handleControl(session: ScrcpySession, raw: string): Promise<boolean> {
  let msg: ControlMessage
  try {
    msg = JSON.parse(raw) as ControlMessage
  } catch {
    return true
  }
  if (msg.kind === 'touch') return session.injectTouch(msg)
  if (msg.kind === 'key') return session.injectKey(msg)
  return true
}

/** Build the scrcpy stream WebSocket handler for `GET /:serial/stream`. */
export function scrcpyStreamHandler(upgradeWebSocket: UpgradeWebSocket) {
  return upgradeWebSocket((c) => {
    const serial = c.req.param('serial') ?? ''
    let session: ScrcpySession | null = null

    return {
      async onOpen(_evt, ws) {
        if (!serial) {
          ws.close(1008, 'missing serial')
          return
        }
        try {
          session = await openScrcpySession(serial)
          void pumpVideo(session, ws).catch((err) => {
            logger.warn({ serial, err: (err as Error).message }, 'scrcpy video pump ended')
            ws.close()
          })
        } catch (err) {
          logger.error({ serial, err: (err as Error).message }, 'scrcpy session failed to open')
          ws.close(1011, (err as Error).message.slice(0, 120))
        }
      },
      async onMessage(evt, ws) {
        if (!session) return
        if (typeof evt.data === 'string') {
          const alive = await handleControl(session, evt.data).catch((err) => {
            logger.warn({ serial, err: (err as Error).message }, 'scrcpy control failed')
            return false
          })
          // Control socket is gone — close the stream so the webview stops
          // sending input into a dead session.
          if (!alive) {
            void session.close()
            session = null
            ws.close()
          }
        }
      },
      onClose() {
        void session?.close()
        session = null
      },
      onError() {
        void session?.close()
        session = null
      },
    }
  })
}
