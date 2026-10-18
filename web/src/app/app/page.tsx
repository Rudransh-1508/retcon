'use client'

import dynamic from 'next/dynamic'

// The explorer reads location and storage while rendering and drives Cytoscape, so it only runs in the browser.
const Explorer = dynamic(() => import('@/explorer/App'), { ssr: false })

export default function AppPage() {
  return <Explorer />
}
