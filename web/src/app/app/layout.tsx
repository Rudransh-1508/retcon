import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Retcon console' }

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return children
}
