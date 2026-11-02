import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { handle } from '../src/gate.ts'

const TEAM = 'abharanam.cloudflareaccess.com'
const AUD = 'aud-tag-123'
const seen: Request[] = []
const forward = async (r: Request) => { seen.push(r); return new Response('shop', { status: 200 }) }
const req = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://1gram.abharanamcollections.com${path}`, { headers })

const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) === `https://${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] })
  return realFetch(input, init)
}) as typeof fetch
const token = (aud = AUD, iss = `https://${TEAM}`) =>
  new SignJWT({ email: 'owner@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime('1h').sign(privateKey)
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD }

test('closed until Cloudflare Access is set up', async () => {
  const r = await handle(req('/shop-admin/'), {}, forward)
  assert.equal(r.status, 503)
  assert.match(await r.text(), /Cloudflare Access/)
})

test('visitors without an Access login are refused', async () => {
  assert.equal((await handle(req('/shop-admin/'), env, forward)).status, 403)
  assert.equal((await handle(req('/shop-admin/', { 'cf-access-jwt-assertion': 'junk' }), env, forward)).status, 403)
  assert.equal((await handle(req('/shop-admin/', { 'cf-access-jwt-assertion': await token('other-app') }), env, forward)).status, 403)
  assert.equal((await handle(req('/shop-admin/', { 'cf-access-jwt-assertion': await token(AUD, 'https://evil.example') }), env, forward)).status, 403)
})

test('the owner gets through, without the /shop-admin prefix, never indexed', async () => {
  seen.length = 0
  const r = await handle(req('/shop-admin/api/products?q=jhumka', { 'cf-access-jwt-assertion': await token() }), env, forward)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow')
  const url = new URL(seen[0].url)
  assert.equal(url.pathname + url.search, '/api/products?q=jhumka')
  assert.equal(url.host, '1gram.abharanamcollections.com')
  assert.equal(seen[0].headers.get('cf-access-jwt-assertion'), null)
})

test('Access cookie works too, and /shop-admin redirects to /shop-admin/', async () => {
  const cookie = `other=1; CF_Authorization=${await token()}`
  const r = await handle(req('/shop-admin', { cookie }), env, forward)
  assert.equal(r.status, 301)
  assert.equal(r.headers.get('location'), 'https://1gram.abharanamcollections.com/shop-admin/')
})

test('only /shop-admin/ paths are passed on', async () => {
  const r = await handle(req('/shop-adminx/secret'), { ACCESS_REQUIRED: 'no' }, forward)
  assert.equal(r.status, 404)
})
