"use client"

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Paperclip, Monitor } from 'lucide-react'
import type { ScreenInventory } from '@/lib/atlas-events'

export function ScreenControl({ onShare, disabled }: { onShare: (text: string, displayId: string) => void | Promise<void>; disabled: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [lastCapture, setLastCapture] = useState<{ dataUrl: string; displayLabel: string; capturedAt: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [inventory, setInventory] = useState<ScreenInventory | null>(null)
  const [displayId, setDisplayId] = useState('')
  const [question, setQuestion] = useState('Describe what is visible on this screen.')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => window.atlasBridge?.onEvent(event => {
    if (event.type === 'atlas.screen_captured') setLastCapture(event.payload as unknown as { dataUrl: string; displayLabel: string; capturedAt: number })
  }), [])
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); setOpen(false) } }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [])

  async function refresh() {
    setLoading(true)
    setError('')
    setInventory(null)
    try {
      const bridge = window.atlasBridge
      if (!bridge) throw new Error('Screen sharing requires the local Electron app.')
      const result = await bridge.listScreens()
      setInventory(result)
      setDisplayId(result.displays.find(d => d.id === result.selectedDisplayId)?.id || result.displays.find(d => d.current)?.id || result.displays.find(d => d.primary)?.id || result.displays[0]?.id || '')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not list screens.') }
    finally { setLoading(false) }
  }

  return <>
    <div className="relative mb-1 shrink-0" ref={menuRef}>
      <button type="button" aria-label="Attachments" aria-haspopup="menu" aria-expanded={menuOpen} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary disabled:opacity-50" disabled={disabled} onClick={() => setMenuOpen(!menuOpen)}><Paperclip className="h-[18px] w-[18px]" /></button>
      {menuOpen && <div role="menu" aria-label="Attachments" className="absolute bottom-full left-0 z-50 mb-2 w-44 rounded-xl border bg-background p-1 shadow-lg">
        <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary" onClick={() => { setMenuOpen(false); setOpen(true); void refresh() }}><Monitor className="h-4 w-4" />Screen</button>
      </div>}
    </div>
    {open && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Share a screen">
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto rounded-xl border bg-background p-6 text-foreground shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Share a screen with Alice</h2><button type="button" aria-label="Close screen sharing" onClick={() => setOpen(false)}>Close</button></div>
        <p className="text-sm text-muted-foreground">Share one screenshot from this device. The entire selected screen goes to your Windows backend for local analysis.</p>
        {loading && <p>Reading monitors…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {inventory && <>
          <label className="block text-sm">Monitor
            <select className="mt-1 w-full rounded border bg-background p-2" value={displayId} onChange={e => setDisplayId(e.target.value)}>
              {inventory.displays.map(d => <option key={d.id} value={d.id}>{d.label} — {d.width} × {d.height}{d.primary ? ' (primary)' : ''}{d.current ? ' (Alice window)' : ''}</option>)}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">{inventory.displays.length} monitor(s). Screen Recording permission: {inventory.permission}.</p>
        </>}
        <label className="block text-sm">What should Alice look at?
          <input className="mt-1 w-full rounded border bg-background p-2" value={question} maxLength={2000} onChange={e => setQuestion(e.target.value)} />
        </label>
        <div className="flex justify-end gap-3">
          <button type="button" disabled={loading} onClick={() => void refresh()}>Refresh</button>
          <button type="button" className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" disabled={disabled || loading || !inventory || !displayId || !question.trim()} onClick={() => { setOpen(false); void onShare(question.trim(), displayId) }}>Share one screenshot</button>
        </div>
        {lastCapture && <figure className="space-y-2 border-t pt-3">
          <figcaption className="text-xs text-muted-foreground">Last captured: {lastCapture.displayLabel} · {new Date(lastCapture.capturedAt).toLocaleTimeString()}</figcaption>
          <img src={lastCapture.dataUrl} alt={`Last screenshot sent from ${lastCapture.displayLabel}`} className="max-h-64 w-full rounded border object-contain" />
        </figure>}
      </div>
    </div>, document.body)}
  </>
}
