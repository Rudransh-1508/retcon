import { Faq } from '@/components/site/Faq'
import { Footer } from '@/components/site/Footer'
import { Hero } from '@/components/site/Hero'
import { HowItWorks } from '@/components/site/HowItWorks'
import { Navbar } from '@/components/site/Navbar'
import { RealRuns } from '@/components/site/RealRuns'
import { RevealController } from '@/components/site/RevealController'
import { UseIt } from '@/components/site/UseIt'

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <HowItWorks />
        <RealRuns />
        <UseIt />
        <Faq />
      </main>
      <Footer />
      <RevealController />
    </>
  )
}
