import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Shot } from '@/lib/steps'

/**
 * A capture in a step card, as Localix's landing shows its own: the picture is the panel, 16:10 and
 * edge to edge; a click opens it larger over the page until Escape, a click outside or Close.
 */
export function StepShot({ shot }: { shot: Shot }) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    close.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener.current?.focus()
    }
  }, [open])

  const picture = (lazy: boolean) => (
    <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading={lazy ? 'lazy' : undefined} decoding="async" />
  )

  return (
    <>
      <button ref={opener} type="button" className="shot-open" aria-label={`Enlarge: ${shot.alt}`} onClick={() => setOpen(true)}>
        {picture(true)}
      </button>
      {open
        ? createPortal(
            <div className="shot-lightbox" role="dialog" aria-modal="true" aria-label={shot.alt}>
              <button type="button" className="shot-backdrop" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />
              <div className="shot-big">{picture(false)}</div>
              <button ref={close} type="button" className="shot-close" aria-label="Close" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
