import { SiteNav } from '@/components/site/SiteNav';
import { Hero } from '@/components/site/Hero';
import { ProductMockup } from '@/components/site/ProductMockup';
import { HowItWorks } from '@/components/site/HowItWorks';

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-void">
      <SiteNav />

      <main className="flex-1">
        <section className="pb-20 pt-16 sm:pb-28 sm:pt-24">
          <Hero />
          <div className="mt-20 sm:mt-28">
            <ProductMockup />
          </div>
        </section>

        <HowItWorks />
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="font-display text-tiny font-bold tracking-cut text-chalk">
            Damian
          </p>
          <p className="text-tiny text-silver">
            Visual Product Intelligence Agent. Sessions run in your browser.
          </p>
        </div>
      </footer>
    </div>
  );
}
