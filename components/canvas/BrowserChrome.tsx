'use client';

import { Lock, Monitor, Smartphone, Tablet } from 'lucide-react';
import type { ViewportSize } from '@/lib/types';

interface BrowserChromeProps {
  url: string;
  viewport: ViewportSize;
  onViewportChange: (next: ViewportSize) => void;
}

const VIEWPORTS: { value: ViewportSize; label: string; icon: typeof Monitor }[] = [
  { value: 'desktop', label: 'Desktop', icon: Monitor },
  { value: 'tablet', label: 'Tablet', icon: Tablet },
  { value: 'mobile', label: 'Mobile', icon: Smartphone },
];

/**
 * Browser chrome above the capture.
 *
 * The segmented control moves the indicator with a CSS transform transition.
 * Framer Motion's shared layout indicator is reserved for the command center
 * tabs, so there is exactly one of those in the interface and it means one
 * thing.
 */
export function BrowserChrome({
  url,
  viewport,
  onViewportChange,
}: BrowserChromeProps) {
  const activeIndex = VIEWPORTS.findIndex((option) => option.value === viewport);

  return (
    <div className="flex items-center gap-3 border-b border-hairline bg-obsidian px-3 py-2.5 sm:gap-4 sm:px-4">
      {/* Window affordances */}
      <span aria-hidden="true" className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <span className="h-2 w-2 rounded-full bg-hairline" />
        <span className="h-2 w-2 rounded-full bg-hairline" />
        <span className="h-2 w-2 rounded-full bg-hairline" />
      </span>

      {/* Address readout */}
      <p className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-hairline bg-void px-3.5 py-1.5">
        <Lock
          aria-label="Connection secured over TLS"
          role="img"
          className="h-3 w-3 shrink-0 text-emerald"
          strokeWidth={2.4}
        />
        <span className="truncate font-body text-tiny font-medium text-silver">
          {url || 'about:blank'}
        </span>
      </p>

      {/* Viewport control */}
      <div
        role="group"
        aria-label="Capture viewport"
        className="relative flex shrink-0 items-center rounded-full border border-hairline bg-void p-1"
      >
        <span
          aria-hidden="true"
          className="absolute left-1 top-1 h-[calc(100%-0.5rem)] w-[calc((100%-0.5rem)/3)] rounded-full bg-hairline transition-transform duration-300 ease-instrument"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {VIEWPORTS.map((option) => {
          const Icon = option.icon;
          const active = option.value === viewport;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onViewportChange(option.value)}
              className={`relative grid h-7 w-9 place-items-center rounded-full transition-colors duration-200 ease-instrument ${
                active ? 'text-chalk' : 'text-silver hover:text-chalk'
              }`}
            >
              <span className="sr-only">{option.label} viewport</span>
              <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
