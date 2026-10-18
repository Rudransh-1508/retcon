'use client'

import { useEffect } from 'react'
import { animate, inView } from 'framer-motion'
import { ease } from './motion'

export function RevealController() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      els.forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none' })
      return
    }
    const stop = inView(els, (el) => {
      const target = el as HTMLElement
      animate(target, { opacity: 1, y: 0 }, { duration: 0.55, delay: Number(target.dataset.delay ?? 0), ease })
    }, { margin: '0px 0px -8% 0px' })
    return stop
  }, [])
  return null
}
