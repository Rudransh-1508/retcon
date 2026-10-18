'use client'

import { useRef } from 'react'
import { m } from 'framer-motion'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useMediaQuery } from '../useMediaQuery'
import type { Decision } from '../api'
import { Why } from './Why'
import { useTour } from '../tour/TourProvider'
import { ease } from '@/components/site/motion'
import { cn } from '@/lib/utils'

/** The Why panel as a shadcn Sheet: it swings in from the right on wide screens and rises from below on phones. */
export function WhySheet({ id, decisions, onClose, onOpen, onChanged }: {
  id: string | null; decisions: Decision[] | null; onClose: () => void; onOpen: (id: string) => void; onChanged: () => void
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  // The sheet is controlled (no Radix trigger), so remember what opened it and give focus back on close.
  const opener = useRef<HTMLElement | null>(null)
  // While the tour runs the sheet is not modal, so the tour's card and highlight above it stay usable, and nothing
  // outside it closes it: the dim layer already blocks the page, and the tour's own buttons may be gone from the
  // DOM by the time Radix checks a deferred outside click, so their position cannot be tested.
  const touring = useTour().status === 'running'
  return (
    <Sheet open={id !== null} modal={!touring} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side={wide ? 'right' : 'bottom'}
        onInteractOutside={(e) => { if (touring) e.preventDefault() }}
        // Focus leaving never closes the panel: modal, it cannot leave; during the tour it moves to the tour's card,
        // and when the tour ends that card disappears and focus falls to the page.
        onFocusOutside={(e) => e.preventDefault()}
        closeProps={{ 'data-tour': 'why-close' }}
        onOpenAutoFocus={(e) => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).focus({ preventScroll: true })
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (opener.current?.isConnected) opener.current.focus({ preventScroll: true })
        }}
        className={cn('gap-0 overflow-hidden border-line bg-paper p-0 focus-visible:ring-0', wide ? 'w-full sm:max-w-[620px]' : 'max-h-[92dvh] rounded-t-3xl')}>
        <SheetTitle className="sr-only">Why</SheetTitle>
        <SheetDescription className="sr-only">What this belief rests on, what the agents decided, and what would change if it were wrong.</SheetDescription>
        <div className="h-full overflow-y-auto overscroll-contain [perspective:1400px]">
          {id && (
            <m.div key={id} className="px-5 pb-10 pt-8 sm:px-7"
              initial={{ opacity: 0, rotateY: wide ? -9 : 0, rotateX: wide ? 0 : 5, x: wide ? 24 : 0 }}
              animate={{ opacity: 1, rotateY: 0, rotateX: 0, x: 0 }}
              style={{ transformOrigin: wide ? '100% 50%' : '50% 100%' }} transition={{ duration: 0.45, ease }}>
              <Why id={id} preview={decisions?.find((d) => d.id === id)} onOpen={onOpen} onChanged={onChanged} />
            </m.div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
