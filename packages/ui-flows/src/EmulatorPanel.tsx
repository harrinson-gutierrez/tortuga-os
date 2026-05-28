import type { ApiClient } from '@tortuga-os/api-client'
import { Badge, Button, Card, Eyebrow, Select } from '@tortuga-os/ui'
import {
  AndroidKeyEventAction,
  AndroidMotionEventAction,
  type ScrcpyMediaStreamPacket,
  ScrcpyVideoCodecId,
} from '@yume-chan/scrcpy'
import { WebCodecsVideoDecoder, WebGLVideoFrameRenderer } from '@yume-chan/scrcpy-decoder-webcodecs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface EmulatorPanelProps {
  client: ApiClient
  projectCode: string
}

/**
 * Live preview of the app running on a connected device / emulator.
 *
 * Uses screenshot polling (1 frame/s) — simpler than scrcpy WebSocket
 * and good enough to see what the agent built. If you need fluid video,
 * we can swap this for the scrcpy bridge later.
 */
export function EmulatorPanel({ client, projectCode }: EmulatorPanelProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const avds = useAsyncData(() => client.preview.listAvds(), [client, refreshKey])
  const devices = useAsyncData(() => client.preview.listDevices(), [client, refreshKey])
  const emulators = useAsyncData(() => client.preview.emulatorStatus(), [client, refreshKey])
  const apps = useAsyncData(() => client.preview.appStatus(), [client, refreshKey])

  // Auto-refresh status while:
  //  - there's already an emulator/device in the lists, OR
  //  - the operator just clicked a long-running action (boot/kill/launch/stop)
  //    so the lists pick up the new entry without waiting for the action to
  //    return (booting an emulator blocks 40-120s — we want the booting
  //    entry to show up within seconds so the boot log card can mount).
  const hasActivity =
    (emulators.data?.emulators.length ?? 0) > 0 ||
    (devices.data?.devices.length ?? 0) > 0 ||
    busy !== null
  useEffect(() => {
    if (!hasActivity) return
    const t = setInterval(() => setRefreshKey((k) => k + 1), 2000)
    return () => clearInterval(t)
  }, [hasActivity])

  const deviceList = devices.data?.devices ?? []
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedSerial && deviceList.length > 0) {
      setSelectedSerial(deviceList[0]!.serial)
    }
    if (selectedSerial && !deviceList.some((d) => d.serial === selectedSerial)) {
      setSelectedSerial(deviceList[0]?.serial ?? null)
    }
  }, [deviceList, selectedSerial])

  const [selectedAvd, setSelectedAvd] = useState<string>('')
  useEffect(() => {
    if (!selectedAvd && avds.data && avds.data.avds.length > 0) {
      setSelectedAvd(avds.data.avds[0]!)
    }
  }, [avds.data, selectedAvd])

  async function withBusy<T>(label: string, fn: () => Promise<T>): Promise<void> {
    setBusy(label)
    setError(null)
    try {
      await fn()
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
          Vista previa de la app
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setRefreshKey((k) => k + 1)}>
          Actualizar
        </Button>
      </div>
      <div className="mt-1 text-[12px] text-text-muted">
        Enciende un emulador, instala la app en él y mírala correr en vivo.
      </div>

      {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}

      {/* Layout: phone-shaped screenshot on top (the thing the operator
          actually looks at), controls stacked underneath. This works
          well when EmulatorPanel sits in a narrow right column next to
          the wizard — phones are portrait, controls don't need width. */}
      <div className="mt-4 space-y-4">
        {/* Top: live screenshot — portrait phone shape. */}
        <div>
          <Eyebrow>Pantalla en vivo</Eyebrow>
          <div
            className="mt-2 rounded-md border border-border bg-bg-alt overflow-hidden flex items-center justify-center mx-auto"
            style={{ aspectRatio: '9 / 19', maxWidth: '320px' }}
          >
            {selectedSerial ? (
              <LiveStream client={client} serial={selectedSerial} />
            ) : (
              <div className="text-[12px] text-text-muted p-6 text-center">
                Sin dispositivo seleccionado.
              </div>
            )}
          </div>
        </div>

        {/* Bottom: controls in a compact column. */}
        <div className="space-y-4">
          <div>
            <Eyebrow>Emulador (AVD)</Eyebrow>
            {avds.loading && !avds.data && (
              <div className="mt-2 text-[12px] text-text-muted">Buscando AVDs…</div>
            )}
            {avds.data && avds.data.avds.length === 0 && (
              <div className="mt-2 text-[12px] text-warning">
                No hay AVDs configurados. Abre Android Studio → Device Manager y crea uno.
              </div>
            )}
            {avds.data &&
              avds.data.avds.length > 0 &&
              (() => {
                // Is the selected AVD already running? If yes, swap the
                // "Encender" CTA for "Apagar" and tag the row green.
                const runningSelected = emulators.data?.emulators.find((e) => e.avd === selectedAvd)
                const isUp =
                  runningSelected?.state === 'booted' || runningSelected?.state === 'ready'
                return (
                  <div className="mt-2 flex items-end gap-2">
                    <Select
                      label="AVD a usar"
                      value={selectedAvd}
                      onChange={(e) => setSelectedAvd(e.target.value)}
                      options={avds.data.avds.map((a) => ({ value: a, label: a }))}
                    />
                    {isUp ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() =>
                          withBusy('kill', () => client.preview.killEmulator(selectedAvd))
                        }
                      >
                        {busy === 'kill' ? '…' : '⏻ Apagar'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={!selectedAvd || busy !== null}
                        onClick={() =>
                          withBusy('boot', () => client.preview.bootEmulator(selectedAvd))
                        }
                      >
                        {busy === 'boot' ? '…' : '▶ Encender'}
                      </Button>
                    )}
                  </div>
                )
              })()}
            {selectedAvd &&
              emulators.data?.emulators.find((e) => e.avd === selectedAvd)?.state === 'booting' && (
                <EmulatorBootLog client={client} avd={selectedAvd} />
              )}
            {emulators.data && emulators.data.emulators.length > 0 && (
              <div className="mt-2 space-y-1">
                {emulators.data.emulators.map((e) => {
                  const isUp = e.state === 'booted' || e.state === 'ready'
                  return (
                    <div
                      key={e.avd}
                      className="text-[11px] font-mono text-text-muted flex items-center gap-2"
                    >
                      <Badge tone={isUp ? 'turtle' : 'warning'} outline>
                        {isUp ? `✓ ${e.state}` : e.state}
                      </Badge>
                      <span>{e.avd}</span>
                      {e.serial && <span className="text-text-dim">{e.serial}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <Eyebrow>Dispositivo</Eyebrow>
            {deviceList.length === 0 ? (
              <div className="mt-2 text-[12px] text-text-muted">
                Aún no hay dispositivos conectados. Enciende un emulador o conecta un cable.
              </div>
            ) : (
              <Select
                label="Dispositivo activo"
                value={selectedSerial ?? ''}
                onChange={(e) => setSelectedSerial(e.target.value || null)}
                options={deviceList.map((d) => ({ value: d.serial, label: d.label }))}
              />
            )}
          </div>

          <div>
            <Eyebrow>App del proyecto</Eyebrow>
            {selectedSerial ? (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  disabled={busy !== null}
                  variant="turtle"
                  onClick={() =>
                    withBusy('launch', () => client.preview.launchApp(projectCode, selectedSerial))
                  }
                >
                  {busy === 'launch' ? 'Lanzando…' : '▶ Instalar y correr'}
                </Button>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  variant="ghost"
                  onClick={() => withBusy('stop', () => client.preview.stopApp(selectedSerial))}
                >
                  Detener
                </Button>
              </div>
            ) : (
              <div className="mt-2 text-[12px] text-text-muted">
                Selecciona un dispositivo arriba primero.
              </div>
            )}
            {apps.data && apps.data.launches.length > 0 && (
              <div className="mt-2 space-y-1">
                {apps.data.launches.map((l) => (
                  <div
                    key={l.serial}
                    className="text-[11px] font-mono text-text-muted flex items-center gap-2"
                  >
                    <Badge tone={l.state === 'running' ? 'turtle' : 'warning'} outline>
                      {l.state}
                    </Badge>
                    <span>
                      {l.projectCode} → {l.serial}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {selectedSerial && apps.data?.launches.some((l) => l.serial === selectedSerial) && (
              <LaunchLog client={client} serial={selectedSerial} />
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

const TYPE_CONFIGURATION = 0

/**
 * Interactive emulator panel. Connects to the sidecar scrcpy WebSocket,
 * decodes H.264 with WebCodecs into a canvas, and forwards pointer +
 * keyboard input back to the device.
 *
 * Ported verbatim from the version that worked end-to-end in 93c690b
 * (May 2026). The earlier rewrite layered retries + screenshot fallback
 * on top, which inadvertently broke pointer events (size never settling,
 * cascading WebSocket connections from a non-stable onFatal callback).
 * Keep this simple — if scrcpy fails, the user sees an error and can
 * reload; we don't try to "rescue" silently.
 */
function LiveStream({ client, serial }: { client: ApiClient; serial: string }) {
  if (!WebCodecsVideoDecoder.isSupported) {
    return <LiveScreenshot client={client} serial={serial} fallbackReason="no-webcodecs" />
  }
  return <LiveScrcpyStream client={client} serial={serial} />
}

type ScrcpyStatus = 'connecting' | 'streaming' | 'error' | 'closed'

function LiveScrcpyStream({ client, serial }: { client: ApiClient; serial: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const decoderRef = useRef<WebCodecsVideoDecoder | null>(null)
  const writerRef = useRef<WritableStreamDefaultWriter<ScrcpyMediaStreamPacket> | null>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const pointerDownRef = useRef(false)

  const [status, setStatus] = useState<ScrcpyStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  // Bump to force a remount of the stream effect — used by the manual
  // "Reintentar" button below when the first WS attempt landed before
  // the AVD had finished booting. NOT a retry budget: each click is one
  // explicit reconnect, no auto-loop that could cascade.
  const [retryCount, setRetryCount] = useState(0)

  const sendControl = useCallback((msg: unknown) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  const toDeviceCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const { width, height } = sizeRef.current
    if (!canvas || width === 0 || height === 0) return null
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * width
    const y = ((e.clientY - rect.top) / rect.height) * height
    return { x: Math.round(x), y: Math.round(y), width, height }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = toDeviceCoords(e)
      if (!p) return
      pointerDownRef.current = true
      canvasRef.current?.setPointerCapture(e.pointerId)
      sendControl({
        kind: 'touch',
        action: AndroidMotionEventAction.Down,
        x: p.x,
        y: p.y,
        videoWidth: p.width,
        videoHeight: p.height,
        pressure: 1,
      })
    },
    [toDeviceCoords, sendControl],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointerDownRef.current) return
      const p = toDeviceCoords(e)
      if (!p) return
      sendControl({
        kind: 'touch',
        action: AndroidMotionEventAction.Move,
        x: p.x,
        y: p.y,
        videoWidth: p.width,
        videoHeight: p.height,
        pressure: 1,
      })
    },
    [toDeviceCoords, sendControl],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = toDeviceCoords(e)
      pointerDownRef.current = false
      canvasRef.current?.releasePointerCapture(e.pointerId)
      if (!p) return
      sendControl({
        kind: 'touch',
        action: AndroidMotionEventAction.Up,
        x: p.x,
        y: p.y,
        videoWidth: p.width,
        videoHeight: p.height,
        pressure: 0,
      })
    },
    [toDeviceCoords, sendControl],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!e.keyCode) return
      e.preventDefault()
      sendControl({
        kind: 'key',
        action: AndroidKeyEventAction.Down,
        keyCode: e.keyCode,
        metaState: 0,
        repeat: 0,
      })
    },
    [sendControl],
  )

  const onKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (!e.keyCode) return
      e.preventDefault()
      sendControl({
        kind: 'key',
        action: AndroidKeyEventAction.Up,
        keyCode: e.keyCode,
        metaState: 0,
        repeat: 0,
      })
    },
    [sendControl],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs from props; retry handled via retryCount
  useEffect(() => {
    let disposed = false
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new WebGLVideoFrameRenderer(canvas)
    const decoder = new WebCodecsVideoDecoder({ codec: ScrcpyVideoCodecId.H264, renderer })
    decoderRef.current = decoder
    const writer = decoder.writable.getWriter()
    writerRef.current = writer

    decoder.sizeChanged(({ width, height }) => {
      sizeRef.current = { width, height }
    })

    const url = client.preview.streamWsUrl(serial)
    if (disposed) return
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws
    ws.onopen = () => setStatus('streaming')
    ws.onerror = () => {
      setError('Stream connection error')
      setStatus('error')
    }
    ws.onclose = () => setStatus((s) => (s === 'error' ? s : 'closed'))
    ws.onmessage = (ev) => {
      if (!(ev.data instanceof ArrayBuffer)) return
      const bytes = new Uint8Array(ev.data)
      const type = bytes[0]
      const data = bytes.slice(1)
      const packet: ScrcpyMediaStreamPacket =
        type === TYPE_CONFIGURATION ? { type: 'configuration', data } : { type: 'data', data }
      writer.write(packet).catch(() => {
        /* decoder closed */
      })
    }

    return () => {
      disposed = true
      ws.close()
      writer.close().catch(() => {})
      decoder.dispose()
      wsRef.current = null
      decoderRef.current = null
      writerRef.current = null
    }
  }, [serial, client, retryCount])

  const canRetry = status === 'closed' || status === 'error'
  const onClickRetry = () => {
    setStatus('connecting')
    setError(null)
    setRetryCount((n) => n + 1)
  }

  return (
    <div className="relative w-full h-full">
      {status !== 'streaming' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-[11px] font-mono text-text-muted bg-bg/60 backdrop-blur-sm px-3 text-center">
          <div className="pointer-events-none">
            {status === 'connecting' && 'Conectando al emulador…'}
            {status === 'error' && (
              <span className="text-danger">{error ?? 'Error de stream'}</span>
            )}
            {status === 'closed' && 'Stream cerrado'}
          </div>
          {canRetry && (
            <button
              type="button"
              onClick={onClickRetry}
              className="text-[11px] font-mono bg-brand/20 text-brand hover:bg-brand/40 rounded px-2 py-0.5"
            >
              ↻ Reintentar
            </button>
          )}
        </div>
      )}
      <canvas
        ref={canvasRef}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        className="w-full h-full block bg-black outline-none"
      />
    </div>
  )
}

function LiveScreenshot({
  client,
  serial,
  fallbackReason,
  onRetry,
}: {
  client: ApiClient
  serial: string
  fallbackReason?: string
  onRetry?: () => void
}) {
  const [tick, setTick] = useState(0)
  const [paused, setPaused] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setTick((k) => k + 1), 1000)
    return () => clearInterval(t)
  }, [paused])
  const url = useMemo(() => {
    const base = client.preview.screenshotUrl(serial)
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}t=${tick}`
  }, [client, serial, tick])
  return (
    <div className="relative w-full h-full">
      {fallbackReason && (
        <div className="absolute top-1 left-1 z-10 flex items-center gap-1">
          <span className="text-[10px] font-mono bg-warning/20 text-warning rounded px-1.5 py-0.5">
            solo lectura ({fallbackReason})
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-[10px] font-mono bg-brand/20 text-brand hover:bg-brand/40 rounded px-1.5 py-0.5"
              title="Volver a intentar el stream interactivo"
            >
              ↻ reintentar
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setPaused((v) => !v)}
        className="absolute top-1 right-1 z-10 text-[11px] bg-bg/80 backdrop-blur-sm text-text-muted hover:text-text rounded px-2 py-0.5"
      >
        {paused ? '▶ Reanudar' : '❚❚ Pausar'}
      </button>
      <img
        ref={imgRef}
        src={url}
        alt="Pantalla del dispositivo"
        className="w-full h-full object-contain block"
        onError={() => {
          /* Device may be off momentarily — keep polling. */
        }}
      />
    </div>
  )
}

/**
 * Live tail of the emulator boot output for the selected AVD. Polls the
 * sidecar every 1.5s while the AVD is still booting. The boot can take
 * 60-120s on cold start and feels frozen without feedback — this surfaces
 * the actual messages (Vulkan errors, snapshot mismatch, qemu progress)
 * that tell the operator something is happening.
 */
function EmulatorBootLog({ client, avd }: { client: ApiClient; avd: string }) {
  const [lines, setLines] = useState<string[]>([])
  const [state, setState] = useState<'booting' | 'ready' | 'stopped'>('booting')
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function tick() {
      try {
        const log = await client.preview.emulatorLog(avd)
        if (disposed) return
        setLines(log.lines)
        setState(log.state)
        if (log.state === 'booting') timer = setTimeout(tick, 1500)
      } catch {
        // 404 = no boot yet for this AVD in this sidecar session.
      }
    }
    void tick()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
    }
  }, [client, avd])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll-to-bottom only on new log lines
  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight
  }, [lines])

  if (lines.length === 0) return null

  return (
    <div className="mt-2">
      <div className="text-[10px] font-mono text-text-muted mb-1 flex items-center gap-2">
        <span>Booting {avd}…</span>
        {state === 'booting' && <span className="text-brand animate-pulse">●</span>}
        <span className="text-text-dim">{lines.length} líneas</span>
      </div>
      <pre
        ref={preRef}
        className="text-[10px] font-mono whitespace-pre-wrap text-text-soft bg-bg-alt border border-border rounded-md px-2 py-1 max-h-[140px] overflow-y-auto m-0"
      >
        {lines.slice(-50).join('\n')}
      </pre>
    </div>
  )
}

/**
 * Live tail of `flutter run` output for the selected device. Polls the
 * sidecar every 1.5s while the launch is running. Auto-scrolls to the
 * bottom so the operator sees the freshest line (typical content: Gradle
 * progress, deprecation warnings, dart compile errors, install steps).
 */
function LaunchLog({ client, serial }: { client: ApiClient; serial: string }) {
  const [lines, setLines] = useState<string[]>([])
  const [running, setRunning] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function tick() {
      try {
        const log = await client.preview.appLog(serial)
        if (disposed) return
        setLines(log.lines)
        setRunning(log.running)
        if (log.running) timer = setTimeout(tick, 1500)
      } catch {
        // 404 = no launch for serial yet. Stop polling silently.
      }
    }
    void tick()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
    }
  }, [client, serial])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll-to-bottom only on new log lines
  useEffect(() => {
    if (!collapsed && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [lines, collapsed])

  if (lines.length === 0) return null

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="text-[11px] font-mono text-text-muted hover:text-text"
      >
        {collapsed ? '▸' : '▾'} Log de la app ({lines.length} líneas)
        {running && <span className="text-brand ml-2 animate-pulse">● en vivo</span>}
      </button>
      {!collapsed && (
        <pre
          ref={preRef}
          className="mt-1 text-[10px] font-mono whitespace-pre-wrap text-text-soft bg-bg-alt border border-border rounded-md px-2 py-1 max-h-[180px] overflow-y-auto m-0"
        >
          {lines.join('\n')}
        </pre>
      )}
    </div>
  )
}
