import { Link } from 'react-router-dom'
import { CHART, ChartCard, ColumnChart, RankedBars, TrendChart, type Point } from '../components/charts'
import { Card, ErrorBox, Notice, PageHeader, PageLoader, StatCard } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useFetch } from '../hooks/useFetch'
import { api } from '../services/api'
import { fmtDate, money, MONTHS, num } from '../utils/format'

interface Dash {
  date: string; month: string
  today?: { net: number; bills: number; items: number; gross: number; discount: number }
  month_sales?: { net: number; bills: number; items: number; gross: number; discount: number }
  inventory?: { total_products: number; total_stock: number; out_of_stock: number; low_stock: number; old_stock: number; old_stock_days: number; low_stock_threshold: number; stock_value?: number }
  expenses?: { today: number; month: number; top_categories: Point[] }
  profit?: { sales: number; cogs: number; gross_profit: number; operating_expenses: number; net_result: number; purchases: number }
  purchase_value_month?: number
  recent_products?: { id: string; name: string; sku: string; selling_price: number; quantity: number; date_added: string; image_url: string | null }[]
  chart_daily_sales?: Point[]; chart_monthly_sales?: Point[]; chart_category_sales?: Point[]; chart_payment_methods?: Point[]
  chart_inventory_by_category?: Point[]; chart_monthly_expenses?: Point[]; chart_expense_categories?: Point[]
}

const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`

export function DashboardPage() {
  const { user, branding, can } = useAuth()
  const { data: d, loading, error, reload } = useFetch(() => api.get<Dash>('/api/dashboard'))
  if (loading && !d) return <PageLoader />
  if (!d) return <ErrorBox message={error || 'Could not load the dashboard'} onRetry={reload} />
  const nothing = !d.today && !d.inventory && !d.expenses
  const shortMonth = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3) + ' ' + ym.slice(2, 4)

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`${branding.name} · ${fmtDate(d.date)} · welcome, ${user?.full_name}`} />
      {nothing && <Card><p className="py-8 text-center text-ink/60">Nothing to show yet - ask the administrator for access to sales, inventory or expenses.</p></Card>}

      {d.today && d.month_sales && (
        <section className="mb-8">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-gradient-to-br from-maroon-900 to-maroon-700 p-6 text-white shadow-luxe lg:row-span-1">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold-300">Today's net sales</div>
              <div className="mt-2 font-sans text-[3rem] font-semibold leading-none text-gold-100">{money(d.today.net)}</div>
              <div className="mt-3 text-sm text-gold-100/80">{num(d.today.bills)} bill{d.today.bills === 1 ? '' : 's'} · {num(d.today.items)} item{d.today.items === 1 ? '' : 's'} sold</div>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
              <StatCard label="Bills today" value={num(d.today.bills)} />
              <StatCard label="Items sold today" value={num(d.today.items)} />
              <StatCard label="Gross sales today" value={money(d.today.gross)} />
              <StatCard label="Discount today" value={money(d.today.discount)} />
              {d.expenses && <StatCard label="Expenses today" value={money(d.expenses.today)} tone="bad" />}
              <StatCard label="Month sales" value={money(d.month_sales.net)} sub={`${monthName(d.month)}`} />
              <StatCard label="Month bills" value={num(d.month_sales.bills)} />
              <StatCard label="Month items" value={num(d.month_sales.items)} />
            </div>
          </div>
        </section>
      )}

      {d.profit && (
        <section className="mb-8">
          <h2 className="mb-1 font-display text-2xl font-semibold text-maroon-900">This month - estimated profit</h2>
          <p className="mb-3 text-xs text-ink/50">Estimates for managing the business, not formal accounting. Inventory purchases are not counted as expenses - they become cost only when the pieces are sold.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <StatCard label="Sales (net)" value={money(d.profit.sales)} />
            <StatCard label="Est. cost of goods" value={money(d.profit.cogs)} />
            <StatCard label="Est. gross profit" value={money(d.profit.gross_profit)} tone={d.profit.gross_profit >= 0 ? 'good' : 'bad'} />
            <StatCard label="Operating expenses" value={money(d.profit.operating_expenses)} />
            <StatCard label="Est. net result" value={money(d.profit.net_result)} tone={d.profit.net_result >= 0 ? 'good' : 'bad'} sub={d.profit.net_result >= 0 ? 'profit' : 'loss'} />
            <StatCard label="Discounts given" value={money(d.month_sales?.discount ?? 0)} />
            <StatCard label="Purchases (stock bought)" value={money(d.profit.purchases)} sub="not deducted above" />
          </div>
        </section>
      )}
      {!d.profit && d.purchase_value_month !== undefined && <div className="mb-8"><StatCard label="Purchase value this month" value={money(d.purchase_value_month)} /></div>}

      {d.inventory && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-2xl font-semibold text-maroon-900">Inventory</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Total products" value={num(d.inventory.total_products)} />
            <StatCard label="Pieces in stock" value={num(d.inventory.total_stock)} />
            <Link to="/inventory/products?stock_status=out_of_stock"><StatCard label="Out of stock" value={num(d.inventory.out_of_stock)} tone={d.inventory.out_of_stock ? 'bad' : 'default'} /></Link>
            <StatCard label="Low stock" value={num(d.inventory.low_stock)} sub={`${d.inventory.low_stock_threshold} or fewer`} tone={d.inventory.low_stock ? 'gold' : 'default'} />
            <StatCard label="Old stock" value={num(d.inventory.old_stock)} sub={`over ${d.inventory.old_stock_days} days`} tone={d.inventory.old_stock ? 'gold' : 'default'} />
            {d.inventory.stock_value !== undefined && <StatCard label="Stock value (cost)" value={money(d.inventory.stock_value)} />}
          </div>
        </section>
      )}

      <section className="mb-8 grid gap-5 lg:grid-cols-2">
        {d.chart_daily_sales && <ChartCard title="Daily sales" subtitle="Net sales, last 30 days" data={d.chart_daily_sales} valueLabel="Net sales" className="lg:col-span-2">
          <TrendChart data={d.chart_daily_sales} name="Net sales" height={240} /></ChartCard>}
        {d.chart_monthly_sales && <ChartCard title="Monthly sales" subtitle="Net sales, last 12 months" data={d.chart_monthly_sales} valueLabel="Net sales">
          <ColumnChart data={d.chart_monthly_sales.map((p) => ({ ...p, label: shortMonth(p.label) }))} name="Net sales" /></ChartCard>}
        {d.chart_category_sales && <ChartCard title="Category sales" subtitle={`Net sales by category, ${monthName(d.month)}`} data={d.chart_category_sales} valueLabel="Net sales">
          <RankedBars data={d.chart_category_sales} /></ChartCard>}
        {d.chart_payment_methods && <ChartCard title="Payment methods" subtitle={`Money received, ${monthName(d.month)}`} data={d.chart_payment_methods} valueLabel="Received">
          <RankedBars data={d.chart_payment_methods} /></ChartCard>}
        {d.chart_inventory_by_category && <ChartCard title="Inventory by category" subtitle="Pieces in stock" data={d.chart_inventory_by_category} fmt="int" valueLabel="Pieces">
          <RankedBars data={d.chart_inventory_by_category} fmt="int" color={CHART.stock} /></ChartCard>}
        {d.chart_monthly_expenses && <ChartCard title="Monthly expenses" subtitle="Operating expenses, last 12 months" data={d.chart_monthly_expenses} valueLabel="Expenses">
          <ColumnChart data={d.chart_monthly_expenses.map((p) => ({ ...p, label: shortMonth(p.label) }))} color={CHART.expense} name="Expenses" /></ChartCard>}
        {d.chart_expense_categories && <ChartCard title="Expense categories" subtitle={`Where the money went, ${monthName(d.month)}`} data={d.chart_expense_categories} valueLabel="Expenses">
          <RankedBars data={d.chart_expense_categories} color={CHART.expense} /></ChartCard>}
      </section>

      {d.expenses && (
        <section className="mb-8">
          <StatCard label="Expenses this month" value={money(d.expenses.month)} tone="bad" sub={d.expenses.top_categories[0] ? `Highest: ${d.expenses.top_categories[0].label} (${money(d.expenses.top_categories[0].value)})` : 'No expenses recorded yet'} />
        </section>
      )}

      {d.recent_products && d.recent_products.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-2xl font-semibold text-maroon-900">Recently added products</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.recent_products.map((p) => (
              <Link key={p.id} to={can('inventory.view') ? `/inventory/products/${p.id}` : '#'} className="flex items-center gap-3 rounded-xl border border-gold-200/70 bg-white p-3 shadow-luxe hover:bg-gold-50/50">
                {p.image_url ? <img src={p.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gold-100 text-xl text-gold-600">◇</div>}
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{p.name}</div><div className="text-xs text-ink/50">{p.sku} · added {fmtDate(p.date_added)}</div></div>
                <div className="text-right text-sm"><div className="font-medium tabular">{money(p.selling_price)}</div><div className="text-xs text-ink/50">{p.quantity} in stock</div></div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {d.today && d.today.bills === 0 && d.inventory && d.inventory.total_products === 0 && (
        <div className="mt-6"><Notice>Welcome! Start by adding a <b>category</b>, a <b>vendor</b> and a <b>location</b>, then add your first product. Or ask the administrator to load the demo data (Backup &amp; Restore page) to explore.</Notice></div>
      )}
    </div>
  )
}
