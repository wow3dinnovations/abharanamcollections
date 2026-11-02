import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Button, Modal } from '../components/ui'

type Tone = 'success' | 'error' | 'info'
interface ToastItem { id: number; tone: Tone; text: string }
interface ConfirmOpts { title: string; message: ReactNode; confirmText?: string; danger?: boolean }

interface Api {
  toast: (text: string, tone?: Tone) => void
  confirm: (opts: ConfirmOpts) => Promise<boolean>
}
const Ctx = createContext<Api | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const nextId = useRef(1)

  const toast = useCallback((text: string, tone: Tone = 'success') => {
    const id = nextId.current++
    setItems((l) => [...l, { id, tone, text }])
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 3500)
  }, [])

  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => setDlg({ ...opts, resolve })), [])
  const close = (v: boolean) => { dlg?.resolve(v); setDlg(null) }

  const tones: Record<Tone, string> = {
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    error: 'border-red-300 bg-red-50 text-red-900',
    info: 'border-gold-300 bg-gold-50 text-maroon-900',
  }
  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="no-print fixed right-4 top-4 z-[100] flex w-[22rem] max-w-[92vw] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`rounded-lg border px-4 py-3 text-sm shadow-luxe ${tones[t.tone]}`} role="status">
            {t.text}
          </div>
        ))}
      </div>
      {dlg && (
        <Modal title={dlg.title} onClose={() => close(false)} size="sm"
          footer={<>
            <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
            <Button variant={dlg.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{dlg.confirmText || 'Confirm'}</Button>
          </>}>
          <div className="text-sm text-ink/80">{dlg.message}</div>
        </Modal>
      )}
    </Ctx.Provider>
  )
}

export function useToast(): Api {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast must be used inside ToastProvider')
  return v
}
