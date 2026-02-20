import { HeroSection } from '@/components/landing/hero';
import { About } from '@/components/landing/about';
import { Pricing } from '@/components/landing/pricing';
import { Testimonials } from '@/components/landing/testimonials';
import { CTA } from '@/components/landing/cta';
import { Footer } from '@/components/landing/footer';

export default function Home() {
  return (
    <main>
      <HeroSection />
      <About />
      <Pricing />
      <Testimonials />
      <CTA />
      <Footer />
    </main>
  );
}

