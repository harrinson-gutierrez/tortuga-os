import { readFile } from 'node:fs/promises'
import { Adb, AdbServerClient } from '@yume-chan/adb'
import { AdbScrcpyClient, AdbScrcpyOptions3_3_1 } from '@yume-chan/adb-scrcpy'
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp'
import {
  type AndroidKeyCode,
  type AndroidKeyEventAction,
  type AndroidKeyEventMeta,
  type AndroidMotionEventAction,
  type ScrcpyMediaStreamPacket,
  ScrcpyPointerId,
} from '@yume-chan/scrcpy'
import { ReadableStream } from '@yume-chan/stream-extra'
import { logger } from '../../shared/logger'
import { resolveScrcpyServer } from './sdk-paths'

/**
 * Runs the full Tango scrcpy chain inside the sidecar: connect to the local adb
 * server, push + start the scrcpy server on the device, and expose the parsed
 * H.264 packet stream + a control writer. The websocket route forwards the
 * video to the webview (which decodes it with WebCodecs) and feeds control
 * intents back here.
 *
 * The bundled scrcpy server is v3.3.1 — it MUST be paired with
 * AdbScrcpyOptions3_3_1 or the handshake breaks.
 */

const ADB_SERVER_PORT = Number.parseInt(process.env.TORTUGA_ADB_SERVER_PORT ?? '5037', 10)
const REMOTE_SERVER_PATH = '/data/local/tmp/scrcpy-server.jar'

export class ScrcpyBridgeError extends Error {}

export interface ScrcpySession {
  serial: string
  /** Parsed scrcpy media packets (configuration + H.264 data) for the decoder. */
  video: ReadableStream<ScrcpyMediaStreamPacket>
  /** Returns false when the control socket is gone, so the caller can stop. */
  injectTouch(input: TouchInput): Promise<boolean>
  injectKey(input: KeyInput): Promise<boolean>
  close(): Promise<void>
}

export interface TouchInput {
  action: number
  x: number
  y: number
  videoWidth: number
  videoHeight: number
  pressure: number
}

export interface KeyInput {
  action: number
  keyCode: number
  metaState: number
  repeat: number
}

let cachedServer: Uint8Array | null = null

async function loadServer(): Promise<Uint8Array> {
  if (cachedServer) return cachedServer
  const path = resolveScrcpyServer()
  if (!path) {
    throw new ScrcpyBridgeError(
      'Bundled scrcpy-server not found. Expected scrcpy-server-v3.3.1 in the sidecar resources.',
    )
  }
  cachedServer = new Uint8Array(await readFile(path))
  return cachedServer
}

async function connectAdb(serial: string): Promise<Adb> {
  const connector = new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: ADB_SERVER_PORT })
  const client = new AdbServerClient(connector)
  const devices = await client.getDevices()
  const device = devices.find((d) => d.serial === serial)
  if (!device) {
    throw new ScrcpyBridgeError(
      `Device "${serial}" is not visible to the adb server. Boot the emulator first.`,
    )
  }
  const transport = await client.createTransport(device)
  return new Adb(transport)
}

/** Stream the server jar bytes to the device, then start scrcpy. */
async function pushServer(adb: Adb, server: Uint8Array): Promise<void> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(server)
      controller.close()
    },
  })
  await AdbScrcpyClient.pushServer(adb, stream as never)
}

/** Open a scrcpy session: parsed video packet stream + control writer. */
export async function openScrcpySession(serial: string): Promise<ScrcpySession> {
  const adb = await connectAdb(serial)
  const server = await loadServer()
  await pushServer(adb, server)

  // Tuned for a fluid embedded mirror over software H.264 decode (WebCodecs):
  // cap the long edge at 1080px and the bitrate at ~4 Mbps so encode + transport
  // + decode stay light. Full native resolution at default 8 Mbps stutters.
  const options = new AdbScrcpyOptions3_3_1({
    audio: false,
    control: true,
    maxFps: 60,
    maxSize: 1080,
    videoBitRate: 4_000_000,
    // Keep the device awake while mirrored — a headless (-no-window) AVD lets the
    // screen sleep, which scrcpy mirrors as a black canvas.
    stayAwake: true,
    powerOn: true,
  })

  const client = await AdbScrcpyClient.start(adb, REMOTE_SERVER_PATH, options)

  const videoStream = await client.videoStream
  if (!videoStream) {
    await client.close()
    throw new ScrcpyBridgeError('scrcpy started without a video stream')
  }
  const controller = client.controller
  if (!controller) {
    await client.close()
    throw new ScrcpyBridgeError('scrcpy started without a control channel')
  }

  logger.info({ serial }, 'scrcpy session opened')

  return {
    serial,
    video: videoStream.stream,
    async injectTouch(input) {
      // A write to a torn-down control socket throws EPIPE from a detached Tango
      // consumer that would otherwise crash the process. Swallow it and report
      // the dead socket so the caller closes the stream instead of spamming.
      try {
        await controller.injectTouch({
          action: input.action as AndroidMotionEventAction,
          pointerId: ScrcpyPointerId.Finger,
          pointerX: input.x,
          pointerY: input.y,
          videoWidth: input.videoWidth,
          videoHeight: input.videoHeight,
          pressure: input.pressure,
          actionButton: 0,
          buttons: 0,
        })
        return true
      } catch (err) {
        logger.warn({ serial, err: (err as Error).message }, 'injectTouch dropped (socket closed)')
        return false
      }
    },
    async injectKey(input) {
      try {
        await controller.injectKeyCode({
          action: input.action as AndroidKeyEventAction,
          keyCode: input.keyCode as AndroidKeyCode,
          repeat: input.repeat,
          metaState: input.metaState as AndroidKeyEventMeta,
        })
        return true
      } catch (err) {
        logger.warn({ serial, err: (err as Error).message }, 'injectKey dropped (socket closed)')
        return false
      }
    },
    async close() {
      try {
        await client.close()
        logger.info({ serial }, 'scrcpy session closed')
      } catch (err) {
        logger.warn({ serial, err: (err as Error).message }, 'scrcpy close failed')
      }
    },
  }
}
