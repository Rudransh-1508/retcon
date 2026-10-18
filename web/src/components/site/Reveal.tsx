/**
 * Marks an element to fade and lift in as it scrolls into view. This renders plain HTML; one RevealController on the
 * page animates every marked element with Framer Motion, so a long page does not hydrate dozens of motion components.
 */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return <div data-reveal data-delay={delay} className={className}>{children}</div>
}
