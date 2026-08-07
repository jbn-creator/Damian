'use client';

import Link from 'next/link';
import { ArrowRight, Crosshair, Layers, ScanLine } from 'lucide-react';

const STEPS = [
  {
    icon: ScanLine,
    title: 'He opens the session',
    body: 'Give Damian a URL, and test credentials if the good screens are behind a login. He walks the product the way a first time user would.',
  },
  {
    icon: Crosshair,
    title: 'He pins what he finds',
    body: 'Every finding lands on the capture at the coordinate that caused it, with the reasoning, the benchmark, and the number behind the claim.',
  },
  {
    icon: Layers,
    title: 'He writes the board',
    body: 'Quick wins, gaps against the category, and the high intent moments asking for nothing. Each one exports to an issue in one click.',
  },
];

/** Three steps, one row, no ornament. */
export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-it-works"
      className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32"
    >
      <h2
        id="how-it-works"
        className="max-w-2xl text-balance font-display text-[clamp(1.875rem,4.5vw,3rem)] font-bold leading-[1.05] tracking-cut text-chalk"
      >
        A product review that shows its work.
      </h2>
      <p className="mt-5 max-w-xl text-pretty leading-relaxed text-silver">
        Damian does not hand back a document. He hands back the screen, marked
        up, with the argument attached to the pixel that earned it.
      </p>

      <ul className="mt-14 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className="rounded-3xl border border-hairline bg-obsidian p-6 transition-colors duration-300 ease-instrument hover:border-silver/35"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-hairline bg-void">
                  <Icon aria-hidden="true" className="h-4 w-4 text-chalk" strokeWidth={2} />
                </span>
                <span
                  data-numeric
                  className="font-display text-tiny font-bold text-silver"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>

              <h3 className="mt-6 text-pretty font-display text-lg font-bold leading-snug tracking-cut text-chalk">
                {step.title}
              </h3>
              <p className="mt-2.5 text-pretty text-tiny leading-[1.7] text-silver">
                {step.body}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-14 flex flex-col items-start gap-4 rounded-3xl border border-hairline bg-obsidian p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-pretty font-display text-xl font-bold tracking-cut text-chalk">
            Point him at something.
          </p>
          <p className="mt-1.5 text-tiny text-silver">
            The first pass takes about nine seconds.
          </p>
        </div>

        <Link
          href="/try"
          className="group inline-flex shrink-0 items-center gap-2.5 rounded-full bg-chalk px-6 py-3 text-tiny font-bold text-void transition-transform duration-300 ease-instrument hover:scale-[1.03] active:scale-[0.99]"
        >
          Try Damian
          <ArrowRight
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform duration-300 ease-instrument group-hover:translate-x-1"
            strokeWidth={2.4}
          />
        </Link>
      </div>
    </section>
  );
}
