// Who may open the shop software, and how a request is passed to it.  Kept free of Cloudflare-only imports so it
// can be tested with plain Node.
import { createRemoteJWKSet, jwtVerify } from 'jose'

export const PREFIX = '/shop-admin'

export interface GateEnv {
  ACCESS_TEAM_DOMAIN?: string // e.g. abharanam.cloudflareaccess.com
  ACCESS_AUD?: string // the Application Audience (AUD) tag of the Cloudflare Access application
  ACCESS_REQUIRED?: string // "no" switches the Access check off (then only the shop software's own login protects it)
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function accessToken(request: Request): string | null {
  const header = request.headers.get('cf-access-jwt-assertion')
  if (header) return header
  const cookie = request.headers.get('cookie') ?? ''
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)
  return m ? m[1] : null
}

/** null = allowed; otherwise the response to send instead. */
export async function checkAccess(request: Request, env: GateEnv): Promise<Response | null> {
  if ((env.ACCESS_REQUIRED ?? '').toLowerCase() === 'no') return null
  const team = (env.ACCESS_TEAM_DOMAIN ?? '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  const aud = (env.ACCESS_AUD ?? '').trim()
  if (!team || !aud) {
    return page(503, 'Not switched on yet',
      'The shop software is protected by Cloudflare Access, which is not set up yet. Follow docs/GO-LIVE.md, step "Shop software online".')
  }
  const token = accessToken(request)
  if (!token) return page(403, 'Not allowed', 'This page is only for the shop owner.')
  let jwks = keySets.get(team)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`))
    keySets.set(team, jwks)
  }
  try {
    await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud })
    return null
  } catch {
    return page(403, 'Not allowed', 'This page is only for the shop owner.')
  }
}

/** The request as the shop software sees it: same site, without the /shop-admin prefix. */
export function toContainer(request: Request): Request | Response {
  const url = new URL(request.url)
  if (url.pathname === PREFIX) {
    url.pathname = `${PREFIX}/`
    return Response.redirect(url.toString(), 301)
  }
  if (!url.pathname.startsWith(`${PREFIX}/`)) return page(404, 'Not found', '')
  url.pathname = url.pathname.slice(PREFIX.length) || '/'
  const headers = new Headers(request.headers)
  headers.delete('cf-access-jwt-assertion') // the shop software does not need it
  return new Request(url.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
    // @ts-expect-error - needed by Node for streamed bodies; ignored by Workers
    duplex: 'half',
  })
}

/** Headers every answer gets: never indexed by search engines, never cached by shared caches. */
export function finish(res: Response): Response {
  const out = new Response(res.body, res)
  out.headers.set('X-Robots-Tag', 'noindex, nofollow')
  if (!out.headers.has('Cache-Control')) out.headers.set('Cache-Control', 'private, no-store')
  return out
}

export function page(status: number, title: string, text: string): Response {
  const html = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width">
<title>${title}</title><body style="font-family:system-ui;background:#faf6ee;color:#3b0d0d;display:grid;place-items:center;min-height:90vh">
<div style="max-width:30rem;padding:1rem"><h1 style="font-weight:600">${title}</h1><p>${text}</p></div>`
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' } })
}

export async function handle(request: Request, env: GateEnv, forward: (r: Request) => Promise<Response>): Promise<Response> {
  const denied = await checkAccess(request, env)
  if (denied) return denied
  const req = toContainer(request)
  if (req instanceof Response) return finish(req)
  return finish(await forward(req))
}
