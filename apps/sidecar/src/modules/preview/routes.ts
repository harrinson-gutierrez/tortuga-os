import { Hono } from 'hono'
import { z } from 'zod'
import { validateBody } from '../../shared/validate'
import {
  AppLauncherError,
  appLaunchStatus,
  getLaunchLog,
  launchProjectApp,
  stopTaskApp,
} from './app-launcher'
import { captureScreenshot, deviceLabel, listAdbDevices } from './device'
import {
  EmulatorError,
  bootAvd,
  emulatorStatus,
  getEmulatorLog,
  killEmulator,
  listAvds,
} from './emulator-manager'
import { probeSinglePort, probeUrl, scanLocalhostForWebPreviews } from './use-cases'

const ProbeUrlInput = z.object({
  url: z.string().url().max(1024),
})

const ProbePortInput = z.object({
  port: z.number().int().min(1).max(65535),
})

const AvdInput = z.object({
  avd: z.string().min(1).max(128),
})

const LaunchAppInput = z.object({
  projectCode: z.string().min(1).max(64),
  serial: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/),
})

const StopAppInput = z.object({
  serial: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/),
})

export const previewRouter = new Hono()
  // ----- Web preview (localhost dev server discovery) -----
  .get('/scan', async (c) => {
    const candidates = await scanLocalhostForWebPreviews()
    return c.json({ candidates })
  })
  .post('/probe-port', async (c) => {
    const v = await validateBody(c, ProbePortInput)
    if (!v.success) return v.response
    const result = await probeSinglePort(v.data.port)
    return c.json({ candidate: result })
  })
  .post('/probe-url', async (c) => {
    const v = await validateBody(c, ProbeUrlInput)
    if (!v.success) return v.response
    try {
      const result = await probeUrl(v.data.url)
      return c.json(result)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  .get('/devices', async (c) => {
    const devices = await listAdbDevices()
    return c.json({
      devices: devices.map((d) => ({ ...d, label: deviceLabel(d) })),
    })
  })
  .get('/devices/:serial/screenshot', async (c) => {
    const serial = c.req.param('serial')
    try {
      const png = await captureScreenshot(serial)
      // Hono needs a Response — return raw PNG body with image/png.
      return new Response(png as unknown as BodyInit, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'cache-control': 'no-store',
        },
      })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  // ----- Emulator lifecycle (Tortuga owns the AVD) -----
  .get('/avds', async (c) => {
    try {
      return c.json({ avds: await listAvds() })
    } catch (err) {
      const status = err instanceof EmulatorError ? 400 : 500
      return c.json({ error: (err as Error).message }, status)
    }
  })
  .get('/emulator/status', (c) => {
    return c.json({ emulators: emulatorStatus() })
  })
  .get('/emulator/log', (c) => {
    const avd = c.req.query('avd')
    if (!avd) return c.json({ error: 'avd query param is required' }, 400)
    const log = getEmulatorLog(avd)
    if (!log) return c.json({ error: 'no emulator boot for this avd' }, 404)
    return c.json(log)
  })
  .post('/emulator/boot', async (c) => {
    const v = await validateBody(c, AvdInput)
    if (!v.success) return v.response
    try {
      return c.json(await bootAvd(v.data.avd))
    } catch (err) {
      const status = err instanceof EmulatorError ? 400 : 500
      return c.json({ error: (err as Error).message }, status)
    }
  })
  .post('/emulator/kill', async (c) => {
    const v = await validateBody(c, AvdInput)
    if (!v.success) return v.response
    try {
      return c.json(await killEmulator(v.data.avd))
    } catch (err) {
      const status = err instanceof EmulatorError ? 400 : 500
      return c.json({ error: (err as Error).message }, status)
    }
  })

  // ----- Task app launch (flutter run onto a device) -----
  .get('/app/status', (c) => {
    return c.json({ launches: appLaunchStatus() })
  })
  .post('/app/launch', async (c) => {
    const v = await validateBody(c, LaunchAppInput)
    if (!v.success) return v.response
    try {
      return c.json(await launchProjectApp(v.data.projectCode, v.data.serial))
    } catch (err) {
      const status = err instanceof AppLauncherError ? 400 : 500
      return c.json({ error: (err as Error).message }, status)
    }
  })
  .post('/app/stop', async (c) => {
    const v = await validateBody(c, StopAppInput)
    if (!v.success) return v.response
    return c.json(stopTaskApp(v.data.serial))
  })
  .get('/app/log', (c) => {
    const serial = c.req.query('serial')
    if (!serial) return c.json({ error: 'serial query param is required' }, 400)
    const log = getLaunchLog(serial)
    if (!log) return c.json({ error: 'no launch for this serial' }, 404)
    return c.json(log)
  })
