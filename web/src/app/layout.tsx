import type { Metadata, Viewport } from 'next'
import './globals.css'
import { MotionProvider } from '@/components/site/motion'
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--nf-display', display: 'swap' })
const sans = Inter({ subsets: ['latin'], variable: '--nf-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--nf-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Retcon: agent memory that can take things back',
  description: 'Retcon acts on security advisories through real pull requests, and when an advisory is withdrawn, revises exactly the work that rested on it.',
  metadataBase: new URL('https://retcon-kappa.vercel.app'),
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f5f2' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1311' },
  ],
}

// Links in pull requests and MCP answers predate the landing page and point at /?why=...; send them to the app.
const legacyRedirect = `if(location.pathname==='/'&&/[?&](why|view|project)=/.test(location.search))location.replace('/app'+location.search);else{var h=document.documentElement;h.classList.add('reveal-ready');setTimeout(function(){h.classList.remove('reveal-ready')},6000)}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: the inline script adds a class to <html> before React loads (scroll reveals).
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: legacyRedirect }} />
      </head>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  )
}
