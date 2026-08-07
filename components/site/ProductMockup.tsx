'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Lock, Monitor, Smartphone, Tablet } from 'lucide-react';
import { CapturedSurface } from '@/components/canvas/CapturedSurface';
import { AUDIT_PINS, DAMIAN_SCRIPT, DEFAULT_TARGET_URL } from '@/lib/mock-data';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import type { AuditPin, DamianLog } from '@/lib/types';

const PIN_FILL: Record<AuditPin['type'], string> = {
  friction: 'bg-crimson',
  warning: 'bg-amber',
  opportunity: 'bg-emerald',
};

const MESSAGE_TONE: Record<DamianLog['type'], string> = {
  info: 'text-silver',
  insight: 'text-chalk',
  action: 'text-chalk font-semibold',
};

/**
 * The poster below the hero.
 *
 * It is the real product, not a picture of one: the same captured surface
 * component, the same pins at the same percentage coordinates, the same
 * telemetry copy. Nothing here is focusable, because a poster is not a control.
 *
 * The bezel gradient is the one gradient on this page, mixed from chalk,
 * silver and the hairline. It reads as the machined edge the reference has.
 */
export function ProductMockup() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    if (reduced) {
      gsap.set(node, { opacity: 1, y: 0, scale: 1 });
      return;
    }

    const tween = gsap.fromTo(
      node,
      { opacity: 0, y: 64, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 1.1, ease: 'power3.out', delay: 0.34 },
    );

    return () => {
      tween.kill();
    };
  }, [reduced]);

  return (
    <div ref={root} className="mx-auto w-full max-w-6xl px-5 opacity-0 sm:px-8">
      {/* Machined bezel */}
      <div className="rounded-[2rem] bg-gradient-to-b from-chalk/70 via-silver/40 to-hairline p-[1px]">
        <div className="rounded-[2rem] bg-gradient-to-b from-silver/25 via-hairline to-void p-2.5 sm:p-3">
          <div className="overflow-hidden rounded-3xl border border-hairline bg-void">
            {/* Session strip */}
            <div className="flex items-center gap-3 border-b border-hairline bg-obsidian px-4 py-2.5">
              <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-hairline" />
                <span className="h-2 w-2 rounded-full bg-hairline" />
                <span className="h-2 w-2 rounded-full bg-hairline" />
              </span>

              <p className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-hairline bg-void px-3 py-1.5">
                <Lock
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 text-emerald"
                  strokeWidth={2.4}
                />
                <span className="truncate text-tiny font-medium text-silver">
                  {DEFAULT_TARGET_URL}
                </span>
              </p>

              <span
                aria-hidden="true"
                className="hidden shrink-0 items-center rounded-full border border-hairline bg-void p-1 sm:flex"
              >
                <span className="grid h-6 w-8 place-items-center rounded-full bg-hairline text-chalk">
                  <Monitor className="h-3 w-3" strokeWidth={2} />
                </span>
                <span className="grid h-6 w-8 place-items-center rounded-full text-silver">
                  <Tablet className="h-3 w-3" strokeWidth={2} />
                </span>
                <span className="grid h-6 w-8 place-items-center rounded-full text-silver">
                  <Smartphone className="h-3 w-3" strokeWidth={2} />
                </span>
              </span>
            </div>

            <div className="flex">
              {/* Canvas with pins held at their real coordinates */}
              <div className="relative w-[62%] shrink-0 border-r border-hairline p-3 instrument-grid sm:p-5">
                <div className="relative overflow-hidden rounded-xl border border-hairline">
                  <CapturedSurface />

                  {AUDIT_PINS.map((pin, index) => (
                    <span
                      key={pin.id}
                      aria-hidden="true"
                      className="absolute h-0 w-0"
                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                    >
                      <span
                        className={`absolute grid h-5 w-5 place-items-center rounded-full sm:h-6 sm:w-6 ${PIN_FILL[pin.type]}`}
                        style={{ transform: 'translate(-50%, -50%)' }}
                      >
                        <span className="font-body text-[0.5625rem] font-bold leading-none text-void sm:text-[0.625rem]">
                          {index + 1}
                        </span>
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Telemetry */}
              <div className="min-w-0 flex-1 p-3 sm:p-5">
                <p className="text-micro font-semibold uppercase text-silver">
                  Live telemetry
                </p>

                <ol className="mt-3 flex flex-col gap-2 sm:gap-2.5">
                  {DAMIAN_SCRIPT.slice(0, 7).map((log) => (
                    <li key={log.id} className="flex items-start gap-2">
                      <span
                        data-numeric
                        className="w-7 shrink-0 pt-px text-right text-[0.5625rem] font-medium text-silver sm:text-tiny"
                      >
                        {log.timestamp}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                          log.type === 'action'
                            ? 'bg-cobalt'
                            : log.type === 'insight'
                              ? 'border border-cobalt'
                              : 'bg-hairline'
                        }`}
                      />
                      <span
                        className={`min-w-0 flex-1 text-pretty text-[0.5625rem] leading-4 sm:text-tiny sm:leading-5 ${MESSAGE_TONE[log.type]}`}
                      >
                        {log.message}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
