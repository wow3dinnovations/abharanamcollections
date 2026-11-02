import { useState } from 'react'
import { Button, Card, ErrorBox, Notice, PageHeader, PageLoader, StatCard } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { useToast } from '../../hooks/useToast'
import { api, ApiError } from '../../services/api'
import { fmtDateTime } from '../../utils/format'

interface PublishResult { categories: number; products_sent: number; products_total: number; photos_uploaded: number; trigger?: string; finished_at?: string }
interface WebsiteStatus {
  configured: boolean
  website_url: string
  supabase_host: string
  auto_minutes: number
  last_success: string | null
  last_error: string | null
  last_error_at: string | null
  last_result: PublishResult | null
  published_products: number
  never_published: number
  products_without_photo: number
}

export function WebsitePage() {
  const { toast } = useToast()
  const st = useFetch(() => api.get<WebsiteStatus>('/api/website/status'))
  const [busy, setBusy] = useState(false)

  const publish = async (force: boolean) => {
    setBusy(true)
    try {
      const r = await api.post<PublishResult>('/api/website/publish', { force })
      toast(r.products_sent ? `Published ${r.products_sent} products (${r.photos_uploaded} photos) to the website.` : 'Website is already up to date.')
      st.reload()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Publish failed', 'error')
      st.reload()
    } finally { setBusy(false) }
  }

  if (st.loading && !st.data) return <PageLoader />
  if (st.error) return <ErrorBox message={st.error} onRetry={st.reload} />
  const s = st.data!

  return (
    <div className="space-y-6">
      <PageHeader
        title="Website & App"
        subtitle="Your products, prices, stock and photos appear on the customer website and Android app."
        actions={s.configured ? (
          <div className="flex gap-2">
            <Button variant="outline" loading={busy} onClick={() => publish(true)}>Re-publish everything</Button>
            <Button loading={busy} onClick={() => publish(false)}>Publish now</Button>
          </div>
        ) : undefined}
      />

      {!s.configured && (
        <Notice tone="warn">
          <p className="font-semibold">The website is not connected yet.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Open the file <code>backend\.env</code> in Notepad (close this application first).</li>
            <li>Add these two lines with your Supabase project address and its <b>service_role / Secret</b> key
              (Supabase → Project Settings → API Keys):
              <pre className="mt-1 rounded bg-white/70 p-2 text-xs">WEBSITE_SUPABASE_URL=https://xxxx.supabase.co{'\n'}WEBSITE_SUPABASE_SERVICE_KEY=eyJ...</pre>
            </li>
            <li>Save, start the application again and come back to this page.</li>
          </ol>
          <p className="mt-2 text-xs">The key stays on this computer only. Never share it or put it on the website.</p>
        </Notice>
      )}

      {s.last_error && (
        <Notice tone="error">
          <b>Last publish failed</b> ({fmtDateTime(s.last_error_at)}): {s.last_error}
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Last published" value={s.last_success ? fmtDateTime(s.last_success) : 'Never'} tone={s.last_success ? 'good' : 'default'} />
        <StatCard label="Products on the website" value={s.published_products} sub={s.never_published ? `${s.never_published} not published yet` : 'All published'} />
        <StatCard label="Products without a photo" value={s.products_without_photo} tone={s.products_without_photo ? 'gold' : 'good'} sub="Add photos on each product's Edit page" />
        <StatCard label="Automatic publish" value={s.auto_minutes > 0 ? `Every ${s.auto_minutes} min` : 'Off'} sub="WEBSITE_SYNC_MINUTES in backend\.env" />
      </div>

      <Card>
        <h3 className="font-semibold">What is published</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li><b>Sent:</b> categories, product name, SKU, selling price, description, collection, material, colour, size, tags, total stock (all locations added up) and the product photo.</li>
          <li><b>Never sent:</b> purchase rate / cost, vendors, locations, sales, bills, customers, expenses, staff.</li>
          <li>Inactive or deleted products disappear from the website. Sold-out products show as "Sold out".</li>
          <li>Only products that changed since the last publish are sent, so it takes a few seconds.</li>
          <li>Hide a product, mark it as a bestseller, add more photos or an MRP in the website's own Admin page.</li>
        </ul>
        {s.last_result && (
          <p className="mt-3 text-xs text-gray-500">
            Last run: {s.last_result.products_sent} changed of {s.last_result.products_total} products, {s.last_result.photos_uploaded} photos uploaded
            {s.last_result.trigger === 'auto' ? ' (automatic)' : ''}.
          </p>
        )}
        <p className="mt-3 text-sm">
          Website: <a className="text-amber-700 underline" href={s.website_url} target="_blank" rel="noreferrer">{s.website_url}</a>
          {s.supabase_host && <span className="text-xs text-gray-500"> · database {s.supabase_host}</span>}
        </p>
      </Card>
    </div>
  )
}
