'use client'

import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion'

export const ease = [0.22, 1, 0.36, 1] as const

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
