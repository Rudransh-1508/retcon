import { Hero } from '@/components/site/Hero'
import { Navbar } from '@/components/site/Navbar'

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
      </main>
    </>
  )
}
