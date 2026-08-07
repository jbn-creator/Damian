'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { ArrowRight } from 'lucide-react';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

/**
 * Landing hero.
 *
 * One word at display scale with a live block cursor after it, a single line
 * of explanation, and one white pill action. Nothing else competes.
 *
 * GSAP runs the entrance. Every element renders from the opacity-0 class so
 * nothing flashes before the timeline takes over.
 */
export function Hero() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    const targets = Array.from(node.querySelectorAll<HTMLElement>('[data-hero]'));
    if (targets.length === 0) return;

    if (reduced) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }

    const timeline = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => gsap.set(targets, { clearProps: 'transform' }),
    });

    timeline.fromTo(
      targets,
      { opacity: 0, y: 26 },
      { opacity: 1, y: 0, duration: 0.72, stagger: 0.09 },
    );

    return () => {
      timeline.kill();
    };
  }, [reduced]);

  return (
    <div ref={root} className="mx-auto max-w-5xl px-5 text-center sm:px-8">
      <p
        data-hero
        className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-hairline bg-obsidian px-3.5 py-1.5 text-micro font-semibold uppercase text-silver opacity-0"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald" />
        Visual Product Intelligence Agent
      </p>

      <h1
        data-hero
        className="font-display text-[clamp(3.25rem,12vw,9rem)] font-bold leading-[0.92] tracking-cut text-chalk opacity-0"
      >
        Damian
        {/* Live cursor. CSS keyframes, stopped by the reduced motion layer. */}
        <span
          aria-hidden="true"
          className="ml-[0.06em] inline-block h-[0.11em] w-[0.36em] translate-y-[-0.06em] animate-caret rounded-full bg-silver align-baseline"
        />
      </h1>

      <p
        data-hero
        className="mx-auto mt-8 max-w-2xl text-pretty text-base leading-relaxed text-silver opacity-0 sm:text-lg"
      >
        Describe the product in the browser, and let Damian handle the rest.
      </p>

      <div data-hero className="mt-10 flex flex-col items-center gap-4 opacity-0">
        <Link
          href="/try"
          className="group inline-flex items-center gap-2.5 rounded-full bg-chalk px-7 py-3.5 text-[0.9375rem] font-bold text-void transition-transform duration-300 ease-instrument hover:scale-[1.03] active:scale-[0.99]"
        >
          Try Damian
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-300 ease-instrument group-hover:translate-x-1"
            strokeWidth={2.4}
          />
        </Link>

        <p className="text-tiny text-silver">
          No account. No install. He opens the session in the browser.
        </p>
      </div>
    </div>
  );
}
