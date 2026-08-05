'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Gauge, Lock } from 'lucide-react';
import { CIRCUMFERENCE, RadialMetric, bandFor } from './RadialMetric';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import type { ScorecardMetric } from '@/lib/types';

interface ScorecardProps {
  metrics: ScorecardMetric[];
}

const COMPOSITE_TEXT: Record<ReturnType<typeof bandFor>, string> = {
  crimson: 'text-crimson',
  amber: 'text-amber',
  emerald: 'text-emerald',
};

/**
 * Tab 3. The executive read.
 *
 * GSAP owns the stroke dash offset and the numeral count. The effect is keyed
 * to mount, and this component only mounts when the tab is entered, so the
 * reveal plays on tab entry and not on every rerender.
 */
export function Scorecard({ metrics }: ScorecardProps) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const node = root.current;
    if (!node || metrics.length === 0) return;

    const arcs = Array.from(node.querySelectorAll<SVGCircleElement>('[data-radial-arc]'));
    const values = Array.from(node.querySelectorAll<HTMLElement>('[data-radial-value]'));

    if (reduced) {
      arcs.forEach((arc) => {
        gsap.set(arc, { strokeDashoffset: Number(arc.dataset.offset ?? 0) });
      });
      gsap.set(values, { opacity: 1 });
      return;
    }

    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

    arcs.forEach((arc, index) => {
      const target = Number(arc.dataset.offset ?? 0);
      timeline.fromTo(
        arc,
        { strokeDashoffset: CIRCUMFERENCE },
        { strokeDashoffset: target, duration: 1.15 },
        index * 0.11,
      );
    });

    values.forEach((value, index) => {
      /* Read the target from the data, never from the DOM the tween writes to. */
      const final = metrics[index]?.score ?? 0;
      const counter = { current: 0 };
      timeline.set(value, { opacity: 1 }, index * 0.11);
      timeline.to(
        counter,
        {
          current: final,
          duration: 1.15,
          onUpdate: () => {
            value.textContent = String(Math.round(counter.current));
          },
        },
        index * 0.11,
      );
    });

    return () => {
      timeline.kill();
    };
  }, [metrics, reduced]);

  if (metrics.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-start justify-center px-5 py-10 sm:px-6">
        <span className="grid h-11 w-11 place-items-center rounded-full border border-hairline bg-obsidian">
          <Lock aria-hidden="true" className="h-4 w-4 text-silver" strokeWidth={2} />
        </span>
        <p className="mt-4 font-display text-lg font-bold leading-tight tracking-cut text-chalk">
          Nothing to score yet.
        </p>
        <p className="mt-2 max-w-sm text-tiny leading-5 text-silver">
          Damian scores four dimensions against category benchmarks once he has
          walked the product. He will not guess at a number he has not measured.
        </p>
      </div>
    );
  }

  const composite = Math.round(
    metrics.reduce((total, metric) => total + metric.score, 0) / metrics.length,
  );
  const compositeBand = bandFor(composite);

  return (
    <div ref={root} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
      {/* Composite */}
      <div className="flex items-center gap-4 rounded-3xl border border-hairline bg-obsidian px-4 py-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline bg-void">
          <Gauge aria-hidden="true" className="h-4 w-4 text-silver" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-micro font-semibold uppercase text-silver">
            Composite product health
          </p>
          <p className="mt-1 text-tiny leading-5 text-silver">
            Two dimensions carry this product. Two are holding it back.
          </p>
        </div>
        <p
          data-numeric
          className={`shrink-0 font-display text-4xl font-extrabold leading-none tracking-cut ${COMPOSITE_TEXT[compositeBand]}`}
        >
          {composite}
        </p>
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-3">
        {metrics.map((metric) => (
          <RadialMetric key={metric.id} metric={metric} />
        ))}
      </ul>

      <p className="mt-5 rounded-2xl border border-hairline bg-obsidian px-4 py-3.5 text-pretty text-tiny leading-[1.65] text-silver">
        <span className="font-semibold text-chalk">Damian&apos;s read: </span>
        The product is well composed and badly introduced. Fix the signup ask and
        the headline and the other two numbers move on their own.
      </p>
    </div>
  );
}
