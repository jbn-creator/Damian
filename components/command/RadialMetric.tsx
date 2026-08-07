'use client';

import type { ScorecardMetric } from '@/lib/types';

const RADIUS = 42;
export const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Score bands map onto the existing status tokens. Below 50 is friction,
 * 50 to 69 is a warning, 70 and above is a win. No fourth colour is invented.
 */
export function bandFor(score: number): 'crimson' | 'amber' | 'emerald' {
  if (score < 50) return 'crimson';
  if (score < 70) return 'amber';
  return 'emerald';
}

const STROKE: Record<ReturnType<typeof bandFor>, string> = {
  crimson: 'stroke-crimson',
  amber: 'stroke-amber',
  emerald: 'stroke-emerald',
};

const TEXT: Record<ReturnType<typeof bandFor>, string> = {
  crimson: 'text-crimson',
  amber: 'text-amber',
  emerald: 'text-emerald',
};

/**
 * One radial.
 *
 * Purely presentational. The arc renders fully retracted and the numeral
 * renders transparent, then Scorecard's GSAP timeline drives both on tab entry.
 * The screen reader value is plain text and never depends on the animation.
 */
export function RadialMetric({ metric }: { metric: ScorecardMetric }) {
  const band = bandFor(metric.score);
  const targetOffset = CIRCUMFERENCE * (1 - metric.score / 100);

  return (
    <li className="flex flex-col items-center rounded-3xl border border-hairline bg-obsidian p-4 text-center">
      <div className="relative h-[5.5rem] w-[5.5rem]">
        <svg aria-hidden="true" viewBox="0 0 100 100" className="h-full w-full">
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="7"
            className="stroke-hairline"
          />
          <circle
            data-radial-arc
            data-offset={targetOffset}
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            className={STROKE[band]}
            style={{
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: CIRCUMFERENCE,
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
            }}
          />
        </svg>

        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center"
        >
          <span
            data-radial-value
            data-numeric
            className={`font-display text-[1.75rem] font-bold leading-none tracking-cut opacity-0 ${TEXT[band]}`}
          >
            {metric.score}
          </span>
        </span>
      </div>

      <h4 className="mt-3.5 text-tiny font-semibold leading-4 text-chalk">
        {metric.label}
      </h4>
      <span className="sr-only">{`Score ${metric.score} out of 100.`}</span>
      <p className="mt-2 text-pretty text-micro font-medium normal-case leading-4 tracking-normal text-silver">
        {metric.verdict}
      </p>
    </li>
  );
}
