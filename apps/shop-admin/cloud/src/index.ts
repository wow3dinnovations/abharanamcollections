// The shop software online: 1gram.abharanamcollections.com/shop-admin
//
// This Worker sits on that address only (the rest of the site is the customer website).  It checks the
// Cloudflare Access login, then passes the request to the shop software, which runs in one Cloudflare Container.
// The container sleeps when nobody uses it for a while; its data lives in Supabase (backend/app/storage/cloud.py).
import { Container, getContainer } from '@cloudflare/containers'
import { handle, type GateEnv } from './gate'

export interface Env extends GateEnv {
  SHOP: DurableObjectNamespace<ShopSoftware>
  WEBSITE_SUPABASE_URL: string
  WEBSITE_SUPABASE_SERVICE_KEY: string
  WEBSITE_SYNC_MINUTES?: string
}

export class ShopSoftware extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '30m'

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env)
    this.envVars = {
      SHOP_CLOUD: '1',
      BASE_PATH: '/shop-admin',
      WEBSITE_SUPABASE_URL: env.WEBSITE_SUPABASE_URL ?? '',
      WEBSITE_SUPABASE_SERVICE_KEY: env.WEBSITE_SUPABASE_SERVICE_KEY ?? '',
      WEBSITE_SYNC_MINUTES: env.WEBSITE_SYNC_MINUTES ?? '5',
      TZ: 'Asia/Kolkata',
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Exactly one copy of the shop software, so two copies never save at the same time.
    const shop = getContainer(env.SHOP, 'main')
    return handle(request, env, (req) => shop.fetch(req))
  },
} satisfies ExportedHandler<Env>
