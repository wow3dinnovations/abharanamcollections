import { useEffect, type ComponentProps, type MouseEvent, type ButtonHTMLAttributes, type ReactNode } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ---------------------------------------------------------------- Buttons */
type Variant = 'primary' | 'gold' | 'outline' | 'ghost' | 'danger'
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:cursor-not-allowed disabled:opacity-50'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' }
  const variants: Record<Variant, string> = {
    primary: 'bg-maroon-800 text-white shadow-sm hover:bg-maroon-700',
    gold: 'bg-gradient-to-b from-gold-300 to-gold-500 text-maroon-950 shadow-sm hover:from-gold-200 hover:to-gold-400',
    outline: 'border border-maroon-200 bg-white text-maroon-800 hover:bg-maroon-50',
    ghost: 'text-maroon-800 hover:bg-maroon-50',
    danger: 'bg-red-700 text-white hover:bg-red-600',
  }
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner small />}
      {children}
    </button>
  )
}

/* ---------------------------------------------------------------- Layout bits */
export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={cx('rounded-2xl border border-gold-200/70 bg-white shadow-luxe', pad && 'p-5', className)}>{children}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-maroon-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink/60">{subtitle}</p>}
        <div className="gold-rule mt-2 w-48" />
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-display text-xl font-semibold text-maroon-800">{children}</h2>
      {actions}
    </div>
  )
}

/* ---------------------------------------------------------------- Feedback */
export function Spinner({ small }: { small?: boolean }) {
  return <span className={cx('inline-block animate-spin rounded-full border-2 border-gold-300 border-t-maroon-700', small ? 'h-4 w-4' : 'h-7 w-7')} />
}
export function PageLoader({ text = 'Loading…' }: { text?: string }) {
  return <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink/60"><Spinner /> {text}</div>
}
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-100 text-2xl text-gold-600">◇</div>
      <div className="font-display text-xl text-maroon-800">{title}</div>
      {hint && <div className="max-w-sm text-sm text-ink/60">{hint}</div>}
      {action}
    </div>
  )
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
      <span>{message}</span>
      {onRetry && <button className="shrink-0 font-medium underline" onClick={onRetry}>Try again</button>}
    </div>
  )
}
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode }) {
  const t = {
    info: 'border-gold-300 bg-gold-50 text-maroon-900',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-red-300 bg-red-50 text-red-900',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  }[tone]
  return <div className={cx('rounded-xl border px-4 py-3 text-sm', t)}>{children}</div>
}

type Tone = 'gray' | 'green' | 'red' | 'amber' | 'maroon' | 'gold' | 'blue'
export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  const t: Record<Tone, string> = {
    gray: 'bg-stone-100 text-stone-700',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    maroon: 'bg-maroon-100 text-maroon-800',
    gold: 'bg-gold-100 text-gold-700',
    blue: 'bg-sky-100 text-sky-800',
  }
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', t[tone])}>{children}</span>
}

/* ---------------------------------------------------------------- Modal */
export function Modal({ title, children, onClose, footer, size = 'md' }: {
  title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const w = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size]
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-maroon-950/50 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('my-8 w-full rounded-2xl border border-gold-300/60 bg-white shadow-2xl', w)} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-gold-200/70 px-6 py-4">
          <h3 className="font-display text-2xl font-semibold text-maroon-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-2xl leading-none text-ink/50 hover:bg-maroon-50" aria-label="Close">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-gold-200/70 bg-cream/60 px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Form fields */
const inputCls = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-ink shadow-sm placeholder:text-stone-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300/50 disabled:bg-stone-100 disabled:text-stone-500'

export function Field({ label, error, hint, required, children, className }: {
  label?: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string
}) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-maroon-800/80">{label}{required && <span className="text-red-600"> *</span>}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink/50">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  )
}
export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}
export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={cx(inputCls, props.className)} />
}
export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea rows={3} {...props} className={cx(inputCls, props.className)} />
}
export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex cursor-pointer items-center gap-2 text-sm', disabled && 'opacity-50')}>
      <input type="checkbox" className="h-4 w-4 rounded border-stone-300 accent-maroon-800" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

/* ---------------------------------------------------------------- Tables */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-gold-200/70 bg-white shadow-luxe"><table className="w-full min-w-max text-left text-sm">{children}</table></div>
}
export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <th className={cx('whitespace-nowrap border-b border-gold-200 bg-maroon-900 px-4 py-3 text-xs font-medium uppercase tracking-wider text-gold-100', right && 'text-right', className)}>{children}</th>
}
export function Td({ children, right, className, colSpan, onClick }: { children?: ReactNode; right?: boolean; className?: string; colSpan?: number; onClick?: (e: MouseEvent<HTMLTableCellElement>) => void }) {
  return <td colSpan={colSpan} onClick={onClick} className={cx('border-b border-stone-100 px-4 py-3 align-middle', right && 'text-right tabular', className)}>{children}</td>
}
export function Tr({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return <tr onClick={onClick} className={cx('transition hover:bg-gold-50/60', onClick && 'cursor-pointer', className)}>{children}</tr>
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink/70">
      <span>{total.toLocaleString('en-IN')} record{total === 1 ? '' : 's'}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Previous</Button>
        <span>Page {page} of {pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</Button>
      </div>
    </div>
  )
}

export function StatCard({ label, value, sub, tone = 'default' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'good' | 'bad' | 'gold' }) {
  const color = { default: 'text-maroon-900', good: 'text-emerald-700', bad: 'text-red-700', gold: 'text-gold-700' }[tone]
  return (
    <div className="rounded-2xl border border-gold-200/70 bg-white p-4 shadow-luxe">
      <div className="text-xs font-medium uppercase tracking-wider text-ink/50">{label}</div>
      <div className={cx('mt-1 font-sans text-[1.65rem] font-semibold leading-tight', color)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink/50">{sub}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-gold-200">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cx('-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition', value === t.id ? 'border-maroon-800 text-maroon-900' : 'border-transparent text-ink/60 hover:text-maroon-800')}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-stone-100 py-2 text-sm last:border-0">
      <span className="text-ink/60">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}
