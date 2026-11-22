/**
 * 面板用的本地 HTTP 路由。
 *
 * 边界：
 *   - 只接受回环来源（remoteAddress 必须是 127.0.0.1 / ::1）；
 *   - Host 必须是回环主机名（挡 DNS rebinding）；
 *   - 若带 Origin，Origin 也必须是回环主机且端口等于本连接端口（挡浏览器跨源）。
 * 不强制自定义头：Electron 同源 fetch 不一定带 Origin，硬要求会把面板自己挡掉。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOGOS } from './logos.js'
import { resolveProjectCwd } from './store.js'

const PREFIX = '/agent-manager'
const LOGO_DIR = fileURLToPath(new URL('../logos/', import.meta.url))
const MAX_BODY_BYTES = 256 * 1024
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function sendJson(res, status, payload) {
  if (res.writableEnded) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    let settled = false
    const chunks = []
    const onData = (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        settled = true
        chunks.length = 0
        cleanup()
        req.resume() // 排空请求但不继续缓存，避免超限后仍消耗内存。
        reject(Object.assign(new Error('请求体过大'), { code: 'BODY_TOO_LARGE' }))
        return
      }
      chunks.push(chunk)
    }
    const onEnd = () => {
      if (settled) return
      settled = true
      cleanup()
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { code: 'BAD_JSON' }))
      }
    }
    const onError = (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
    }
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
  })
}

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
}

function authorityOf(origin) {
  try {
    const url = new URL(origin)
    return { host: url.hostname, port: url.port || (url.protocol === 'https:' ? '443' : '80'), scheme: url.protocol }
  } catch {
    return undefined
  }
}

function checkRequest(req) {
  const address = req.socket?.remoteAddress ?? ''
  if (!LOOPBACK.has(address)) return 'not-loopback'
  const host = req.headers.host
  const hostAuthority = typeof host === 'string' ? authorityOf(`http://${host}`) : undefined
  if (hostAuthority === undefined || !isLoopbackHost(hostAuthority.host)) return 'host'
  const origin = req.headers.origin
  if (origin === 'null') return 'origin'
  if (typeof origin === 'string') {
    const originAuthority = authorityOf(origin)
    if (originAuthority === undefined) return 'origin'
    // 桌面端可能用自定义 scheme（非 http/https）；网站一定是 http(s)，所以只校验 http(s)。
    if (originAuthority.scheme === 'http:' || originAuthority.scheme === 'https:') {
      if (!isLoopbackHost(originAuthority.host)) return 'origin'
      const localPort = String(req.socket?.localPort ?? '')
      if (localPort !== '' && originAuthority.port !== localPort) return 'origin-port'
    }
  }
  return undefined
}

export function registerRoutes(ctx, api, roots) {
  const web = ctx.get('webServer')
  if (web === undefined) return []

  const wrap = (method, handler) => async (req, res) => {
    if ((req.method ?? 'GET').toUpperCase() !== method) {
      sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '方法不允许' } })
      return
    }
    const denial = checkRequest(req)
    if (denial !== undefined) {
      ctx.logger?.warn?.(`[agent-manager] denied: ${denial}`)
      sendJson(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: '请求被拒绝' } })
      return
    }
    try {
      const value = await handler(req, res)
      sendJson(res, 200, { ok: true, value })
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'INTERNAL'
      const clientStatus = {
        BODY_TOO_LARGE: 413,
        BAD_JSON: 400, BAD_REQUEST: 400, BAD_CWD: 400, BAD_TEMPLATE: 400,
        STALE_DEFINITION: 409,
        AGENT_DEFINITION_INVALID: 400, POLICY_CORRUPT: 409, GENERATE_INVALID: 422,
        BAD_CARD: 400, BAD_AGENT_NAME: 400, BAD_STYLE: 400,
        CARD_NOT_FOUND: 404, STYLE_NOT_FOUND: 404, AGENT_NOT_FOUND: 404,
        CWD_NOT_ALLOWED: 403, AGENT_DISABLED: 403,
        UNSUPPORTED: 501, PRESET_NOT_APPLIED: 409, AGENT_PRESET_BROKEN: 409,
      }
      const status = clientStatus[code] ?? 500
      if (status === 500) ctx.logger?.warn?.(`[agent-manager] ${String(error?.stack ?? error)}`)
      sendJson(res, status, {
        ok: false,
        error: {
          code: status === 500 ? 'INTERNAL' : code,
          message: status === 500 ? '内部错误' : String(error?.message ?? error),
        },
      })
    }
  }

  const cwdOf = async (raw) => resolveProjectCwd(raw, roots())

  const routes = [
    { kind: 'exact', path: `${PREFIX}/groups`, handler: wrap('GET', async () => api.listGroups()) },
    { kind: 'exact', path: `${PREFIX}/models`, handler: wrap('GET', async () => api.listModels()) },
    {
      kind: 'exact',
      path: `${PREFIX}/efforts`,
      handler: wrap('GET', async (req) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        return api.efforts({
          provider: url.searchParams.get('provider') ?? undefined,
          model: url.searchParams.get('model') ?? undefined,
        })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/list`,
      handler: wrap('GET', async (req) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const cwd = await cwdOf(url.searchParams.get('cwd') ?? undefined)
        return api.list(cwd)
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/templates`,
      // 同路径只能注册一次（effect 键是 path），所以按方法分派。
      handler: async (req, res) => {
        const method = (req.method ?? 'GET').toUpperCase()
        if (method === 'POST') {
          return wrap('POST', async (inner) => {
            const body = await readBody(inner)
            return api.saveAsTemplate({
              definition: body?.definition,
              id: body?.id,
              label: body?.label,
              description: body?.description,
            })
          })(req, res)
        }
        if (method !== 'GET') {
          sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '方法不允许' } })
          return
        }
        return wrap('GET', async () => api.templates())(req, res)
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/open-session`,
      handler: wrap('POST', async (req) => {
        const body = await readBody(req)
        if (typeof body?.name !== 'string') throw Object.assign(new Error('缺少 name'), { code: 'BAD_REQUEST' })
        const cwd = body.cwd !== undefined ? await cwdOf(body.cwd) : undefined
        return api.openSession({ name: body.name, workspaceId: body.workspaceId, cwd })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/save`,
      handler: wrap('POST', async (req) => {
        const body = await readBody(req)
        if (typeof body?.definition !== 'object' || body.definition === null) {
          throw Object.assign(new Error('缺少 definition'), { code: 'BAD_REQUEST' })
        }
        const scope = body.scope === 'project' ? 'project' : 'user'
        const previousScope =
          body.previousScope === 'project' || body.previousScope === 'user' ? body.previousScope : undefined
        const needsCwd = scope === 'project' || previousScope === 'project'
        const cwd = needsCwd || body.cwd !== undefined ? await cwdOf(body.cwd) : undefined
        if (needsCwd && cwd === undefined) {
          throw Object.assign(new Error('该操作需要项目路径'), { code: 'BAD_CWD' })
        }
        return api.save(cwd, {
          definition: body.definition,
          scope,
          previousScope,
          templateId: typeof body.templateId === 'string' ? body.templateId : undefined,
          // 并发写保护：客户端把它读到的那份文件的 mtime 带回来（见 store.saveDefinition）。
          expectedMtime: typeof body.expectedMtime === 'number' && Number.isFinite(body.expectedMtime) ? body.expectedMtime : undefined,
        })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/remove`,
      handler: wrap('POST', async (req) => {
        const body = await readBody(req)
        if (typeof body?.name !== 'string') throw Object.assign(new Error('缺少 name'), { code: 'BAD_REQUEST' })
        const scope = body.scope === 'project' ? 'project' : 'user'
        const cwd = scope === 'project' ? await cwdOf(body.cwd) : undefined
        if (scope === 'project' && cwd === undefined) {
          throw Object.assign(new Error('项目级删除需要项目路径'), { code: 'BAD_CWD' })
        }
        return api.remove(cwd, { name: body.name, scope })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/policy`,
      handler: wrap('POST', async (req) => {
        const body = await readBody(req)
        const cwd = await cwdOf(body.cwd)
        if (cwd === undefined) throw Object.assign(new Error('需要项目路径'), { code: 'BAD_CWD' })
        if (body.enabled !== undefined && !Array.isArray(body.enabled)) {
          throw Object.assign(new Error('enabled 必须是数组'), { code: 'BAD_REQUEST' })
        }
        if (body.disabled !== undefined && !Array.isArray(body.disabled)) {
          throw Object.assign(new Error('disabled 必须是数组'), { code: 'BAD_REQUEST' })
        }
        return api.setPolicy(cwd, {
          enabled: body.enabled,
          disabled: body.disabled,
          trustProject: typeof body.trustProject === 'boolean' ? body.trustProject : undefined,
        })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/knowledge`,
      handler: wrap('GET', async (req) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        return api.knowledge({ agent: url.searchParams.get('agent') ?? undefined })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/knowledge/read`,
      handler: wrap('GET', async (req) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        return api.readKnowledge({
          agent: url.searchParams.get('agent') ?? undefined,
          card: url.searchParams.get('card') ?? undefined,
        })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/knowledge/save`,
      handler: wrap('POST', async (req) => {
        const body = await readBody(req)
        return api.saveKnowledge({
          agent: body?.agent,
          card: body?.card,
          name: body?.name,
          description: body?.description,
          body: body?.body,
        })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/knowledge/remove`,
      handler: wrap('POST', async (req) => {
        const body = await readBody(req)
        return api.removeKnowledge({ agent: body?.agent, card: body?.card })
      }),
    },
    { kind: 'exact', path: `${PREFIX}/styles`, handler: wrap('GET', async () => api.styles()) },
    { kind: 'exact', path: `${PREFIX}/styles/install`, handler: wrap('POST', async () => api.installStyles()) },
    {
      kind: 'exact',
      path: `${PREFIX}/styles/read`,
      handler: wrap('GET', async (req) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        return api.readStyle({ style: url.searchParams.get('style') ?? undefined })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/styles/save`,
      handler: wrap('POST', async (req) => {
        const body = await readBody(req)
        return api.saveStyleValue({ style: body?.style, name: body?.name, description: body?.description, body: body?.body })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/styles/remove`,
      handler: wrap('POST', async (req) => {
        const body = await readBody(req)
        return api.removeStyle({ style: body?.style })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/ingest`,
      handler: wrap('POST', async (req) => {
        const body = await readBody(req)
        return api.ingest({
          agent: body?.agent,
          text: body?.text,
          urls: body?.urls,
          provider: body?.provider,
          model: body?.model,
        })
      }),
    },
    {
      kind: 'exact',
      path: `${PREFIX}/generate`,
      handler: wrap('POST', async (req) => {
        const body = await readBody(req)
        return api.generate({
          need: body?.need,
          answers: body?.answers,
          provider: body?.provider,
          model: body?.model,
        })
      }),
    },
    { kind: 'exact', path: `${PREFIX}/logos`, handler: wrap('GET', async () => ({ logos: LOGOS })) },
    ...LOGOS.map((logo) => ({
      kind: 'exact',
      path: `${PREFIX}/logo/${logo.id}.png`,
      handler: async (req, res) => {
        if ((req.method ?? 'GET').toUpperCase() !== 'GET') { sendJson(res, 405, { ok: false }); return }
        const denial = checkRequest(req)
        if (denial !== undefined) { sendJson(res, 403, { ok: false }); return }
        try {
          const body = await readFile(join(LOGO_DIR, logo.file))
          res.statusCode = 200
          res.setHeader('content-type', 'image/png')
          res.setHeader('cache-control', 'public, max-age=86400, immutable')
          res.end(body)
        } catch {
          sendJson(res, 404, { ok: false })
        }
      },
    })),
  ]

  return routes.map((route) => ctx.effect(() => web.register(route), `agent-manager.route:${route.path}`))
}
