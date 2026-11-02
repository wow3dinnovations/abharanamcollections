import { useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { money } from '../utils/format'

export interface LabelData {
  product_id: string; sku: string; barcode: string; name: string; price: number; copies: number; svg: string
  module_mm?: number      // this tag only (used by the printer test page)
  caption?: string        // text under the barcode instead of the code (printer test page)
}
export interface LabelSize { id: string; name: string; width_mm: number; height_mm: number }

/** Number of bar-widths in the barcode picture, including its quiet zones. */
export function svgModules(svg: string): number {
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) 1"/)
  return m ? Number(m[1]) : 0
}

interface LabelProps { data: LabelData; size: LabelSize; brand: string; tagline?: string; rotate?: boolean; moduleMm?: number }

/** One jewellery tag. Everything is sized in millimetres so it prints at the real size.
 *  Small tags (like 12 x 18 mm) get a compact layout: price, barcode, code. */
export function Label({ data, size, brand, tagline, rotate = false, moduleMm = 0 }: LabelProps) {
  const inner = <LabelBody data={data} W={rotate ? size.height_mm : size.width_mm} H={rotate ? size.width_mm : size.height_mm} brand={brand} tagline={tagline} moduleMm={data.module_mm ?? moduleMm} />
  if (!rotate) return inner
  // sideways: draw the tag turned 90 degrees inside the real (unrotated) label area
  return (
    <div className="label-rot" style={{ position: 'relative', width: `${size.width_mm}mm`, height: `${size.height_mm}mm`, overflow: 'hidden', background: '#fff' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: 'top left', transform: `translateX(${size.width_mm}mm) rotate(90deg)` }}>{inner}</div>
    </div>
  )
}

function LabelBody({ data, W, H, brand, tagline, moduleMm }: { data: LabelData; W: number; H: number; brand: string; tagline?: string; moduleMm: number }) {
  const tiny = W < 30 || H < 18
  const modules = svgModules(data.svg)
  const price = money(data.price).replace('.00', '')
  const box: CSSProperties = {
    width: `${W}mm`, height: `${H}mm`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    alignItems: 'center', textAlign: 'center', background: '#fff', color: '#000', overflow: 'hidden',
  }

  if (tiny) {
    const pad = Math.max(Math.min(W, H) * 0.05, 0.4)
    const availW = W - 2 * pad
    const barW = moduleMm > 0 && modules > 0 ? Math.min(modules * moduleMm, availW) : availW
    return (
      <div className="label" style={{ ...box, padding: `${pad}mm`, fontFamily: 'Inter, Arial, sans-serif' }}>
        <div style={{ fontSize: `${Math.min(H * 0.29, 3.8).toFixed(2)}mm`, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}>{price}</div>
        <div style={{ width: `${barW.toFixed(3)}mm`, height: `${(H * 0.36).toFixed(2)}mm` }}
          dangerouslySetInnerHTML={{ __html: data.svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ') }} />
        <div style={{ fontSize: `${Math.min(H * 0.15, 1.9).toFixed(2)}mm`, letterSpacing: '0.1mm', lineHeight: 1, whiteSpace: 'nowrap' }}>{data.caption ?? data.barcode}</div>
      </div>
    )
  }

  const s = Math.min(H / 30, W / 50)
  const mm = (v: number) => `${(v * s).toFixed(2)}mm`
  const barW = moduleMm > 0 && modules > 0 ? Math.min(modules * moduleMm, W * 0.92) : W * 0.92
  return (
    <div className="label" style={{ ...box, padding: mm(1.4), fontFamily: '"Cormorant Garamond", Georgia, serif' }}>
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: mm(2.3), fontWeight: 700, letterSpacing: mm(0.32), lineHeight: 1.1, whiteSpace: 'nowrap' }}>{brand}</div>
        {tagline && H >= 28 && <div style={{ fontSize: mm(1.5), fontStyle: 'italic', lineHeight: 1.1 }}>{tagline}</div>}
        <div style={{ height: '0.2mm', background: '#000', margin: `${mm(0.5)} auto 0`, width: '70%' }} />
      </div>
      <div style={{ width: '100%', fontFamily: 'Inter, Arial, sans-serif' }}>
        <div style={{ fontSize: mm(2.5), lineHeight: 1.15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
        <div style={{ fontSize: mm(4.4), fontWeight: 700, lineHeight: 1.1 }}>{price}</div>
      </div>
      <div style={{ width: `${barW.toFixed(3)}mm` }}>
        <div style={{ height: mm(H >= 28 ? 8.5 : 7), width: '100%' }} dangerouslySetInnerHTML={{ __html: data.svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ') }} />
        <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: mm(2), letterSpacing: mm(0.2), lineHeight: 1.2, marginTop: mm(0.5), whiteSpace: 'nowrap' }}>{data.caption ?? data.sku}</div>
      </div>
    </div>
  )
}

/** The hidden sheet that is printed: one page per label, sized exactly to the label. */
export function LabelSheet({ labels, size, brand, tagline, active, rotate = false, moduleMm = 0 }: {
  labels: LabelData[]; size: LabelSize; brand: string; tagline?: string; active: boolean; rotate?: boolean; moduleMm?: number
}) {
  useEffect(() => {
    const st = document.createElement('style')
    st.id = 'label-print-style'
    st.textContent = `
      .label-sheet { display: none; }
      @media print {
        @page { size: ${size.width_mm}mm ${size.height_mm}mm; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        body.printing-labels #root { display: none !important; }
        body.printing-labels .label-sheet { display: block !important; }
        .label-sheet .label-page { width: ${size.width_mm}mm; height: ${size.height_mm}mm; page-break-after: always; break-after: page; overflow: hidden; }
        .label-sheet .label-page:last-child { page-break-after: auto; break-after: auto; }
      }`
    document.head.appendChild(st)
    return () => { st.remove() }
  }, [size.width_mm, size.height_mm])
  if (!active) return null
  return createPortal(
    <div className="label-sheet">
      {labels.flatMap((l) => Array.from({ length: l.copies }, (_, i) => (
        <div className="label-page" key={`${l.product_id}-${i}`}><Label data={l} size={size} brand={brand} tagline={tagline} rotate={rotate} moduleMm={moduleMm} /></div>
      )))}
    </div>, document.body)
}

/** Call to open the browser print window for the label sheet. */
export function printLabelSheet() {
  document.body.classList.add('printing-labels')
  const done = () => { document.body.classList.remove('printing-labels'); window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  setTimeout(() => window.print(), 100)
}
