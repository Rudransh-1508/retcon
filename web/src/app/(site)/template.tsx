'use client'

import { useEffect } from 'react'
import { m } from 'framer-motion'
import { ease } from '@/components/site/motion'

// The first paint is never held back for a transition; only client-side navigations fade in.
let firstRender = true

export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  const initial = firstRender ? false : { opacity: 0, y: 8 }
  useEffect(() => { firstRender = false }, [])
  return (
    <m.div initial={initial} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
      {children}
    </m.div>
  )
}
