import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

/** Shows the uploaded logo (assets/logo/logo.png). Until a file exists, an elegant monogram is used. */
export function Logo({ size = 48, showText = false, light = false }: { size?: number; showText?: boolean; light?: boolean }) {
  const { branding } = useAuth()
  const [failed, setFailed] = useState(false)
  const src = `/api/branding/logo?v=${branding.has_logo ? 1 : 0}`
  return (
    <div className="flex items-center gap-3">
      {branding.has_logo && !failed ? (
        <img src={src} alt={branding.name} style={{ height: size, maxWidth: size * 3 }} className="object-contain" onError={() => setFailed(true)} />
      ) : (
        <Monogram size={size} />
      )}
      {showText && (
        <div className="leading-tight">
          <div className={`font-display text-xl font-bold tracking-[0.12em] ${light ? 'text-gold-200' : 'text-maroon-900'}`}>{branding.name}</div>
          <div className={`text-[11px] italic tracking-wide ${light ? 'text-gold-300/80' : 'text-gold-600'}`}>{branding.tagline}</div>
        </div>
      )}
    </div>
  )
}

export function Monogram({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ecd996" />
          <stop offset="1" stopColor="#b98f36" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="#5a1024" stroke="url(#g)" strokeWidth="2" />
      <circle cx="32" cy="32" r="25" fill="none" stroke="url(#g)" strokeWidth="0.8" />
      <path d="M32 14 46 50h-5.5l-2.9-7.6H26.4L23.5 50H18L32 14Zm0 12.5-3.6 9.9h7.2L32 26.5Z" fill="url(#g)" />
    </svg>
  )
}
