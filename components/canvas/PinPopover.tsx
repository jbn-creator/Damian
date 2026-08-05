'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Code2, Crosshair, X } from 'lucide-react';
import { CapturedSurface } from './CapturedSurface';
import { PIN_TYPE_LABEL } from '@/lib/mock-data';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import type { AuditPin } from '@/lib/types';

export interface PinPlacement {
  side: 'left' | 'right';
  align: 'top' | 'center' | 'bottom';
  compact: boolean;
  /** Adjusted for the current zoom step, already clamped to the frame. */
  x: number;
  y: number;
}

interface PinPopoverProps {
  pin: AuditPin;
  index: number;
  placement: PinPlacement;
  popoverId: string;
  onClose: () => void;
  onGenerateFix: (pin: AuditPin) => void;
}

const ACCENT_TEXT: Record<AuditPin['type'], string> = {
  friction: 'text-crimson',
  warning: 'text-amber',
  opportunity: 'text-emerald',
};

const ACCENT_CHIP: Record<AuditPin['type'], string> = {
  friction: 'border-crimson/40 bg-crimson/10 text-crimson',
  warning: 'border-amber/40 bg-amber/10 text-amber',
  opportunity: 'border-emerald/40 bg-emerald/10 text-emerald',
};

const ACCENT_FILL: Record<AuditPin['type'], string> = {
  friction: 'bg-crimson',
  warning: 'bg-amber',
  opportunity: 'bg-emerald',
};

const ACCENT_RING: Record<AuditPin['type'], string> = {
  friction: 'border-crimson',
  warning: 'border-amber',
  opportunity: 'border-emerald',
};

const CROP_ZOOM = 3;

/**
 * The pin popover.
 *
 * Placement lives on the outer wrapper as plain CSS, and Framer Motion writes
 * transform on the inner panel only. That separation is what allows the anchor
 * to flip sides without either system overwriting the other.
 */
export function PinPopover({
  pin,
  index,
  placement,
  popoverId,
  onClose,
  onGenerateFix,
}: PinPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const titleId = `${popoverId}-title`;

  /* Move focus into the panel so its content is announced and Escape lands. */
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  const { side, align, compact, x, y } = placement;

  const wrapperStyle: React.CSSProperties = compact
    ? {}
    : {
        left: side === 'right' ? `${x}%` : undefined,
        right: side === 'left' ? `${100 - x}%` : undefined,
        top: `${y}%`,
        transform: [
          side === 'right' ? 'translateX(1.5rem)' : 'translateX(-1.5rem)',
          align === 'center'
            ? 'translateY(-50%)'
            : align === 'bottom'
              ? 'translateY(-100%)'
              : 'translateY(0)',
        ].join(' '),
      };

  return (
    <div
      className={
        compact
          ? 'absolute inset-x-3 bottom-3 z-20'
          : 'absolute z-20 w-[min(21rem,calc(100vw-4rem))]'
      }
      style={wrapperStyle}
      onClick={(event) => event.stopPropagation()}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={
          reduced
            ? false
            : {
                opacity: 0,
                scale: 0.94,
                x: compact ? 0 : side === 'right' ? -10 : 10,
                y: compact ? 12 : 0,
              }
        }
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        exit={
          reduced
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.96, y: compact ? 8 : 0, transition: { duration: 0.16 } }
        }
        transition={
          reduced ? { duration: 0 } : { duration: 0.28, ease: [0.16, 0.84, 0.24, 1] }
        }
        className="overflow-hidden rounded-3xl border border-hairline bg-obsidian shadow-panel focus-visible:outline-none"
      >
        {/* Zoomed crop of the exact region, centred on the pin coordinate. */}
        <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-hairline bg-void">
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${50 - pin.x}%, ${50 - pin.y}%) scale(${CROP_ZOOM})`,
              transformOrigin: `${pin.x}% ${pin.y}%`,
            }}
          >
            <CapturedSurface />
          </div>

          {/* Reticle over the finding. */}
          <span
            aria-hidden="true"
            className={`absolute left-1/2 top-1/2 h-10 w-10 rounded-full border-2 ${ACCENT_RING[pin.type]}`}
            style={{ transform: 'translate(-50%, -50%)' }}
          />
          <span
            aria-hidden="true"
            className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-hairline bg-void/90 px-2.5 py-1 backdrop-blur-sm"
          >
            <Crosshair className="h-2.5 w-2.5 text-silver" strokeWidth={2.4} />
            <span data-numeric className="text-micro font-semibold uppercase text-silver">
              {`${pin.x}, ${pin.y}`}
            </span>
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro font-bold uppercase ${ACCENT_CHIP[pin.type]}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${ACCENT_FILL[pin.type]}`} />
                  {PIN_TYPE_LABEL[pin.type]}
                </span>
                <span data-numeric className="text-micro font-semibold uppercase text-silver">
                  {`Pin ${index + 1}`}
                </span>
              </span>

              <h3
                id={titleId}
                className="mt-3 text-pretty font-display text-base font-bold leading-snug tracking-cut text-chalk"
              >
                {pin.title}
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-hairline text-silver transition-colors duration-200 ease-instrument hover:border-silver/50 hover:text-chalk"
            >
              <span className="sr-only">{`Close reasoning for pin ${index + 1}`}</span>
              <X aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </div>

          <p className="mt-3 text-pretty text-tiny leading-[1.65] text-silver">{pin.description}</p>

          {/* Impact score */}
          <div className="mt-4 rounded-2xl border border-hairline bg-void p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-micro font-semibold uppercase text-silver">
                Impact score
              </span>
              <span
                data-numeric
                className={`font-display text-2xl font-extrabold leading-none tracking-cut ${ACCENT_TEXT[pin.type]}`}
              >
                {pin.impactScore}
                <span className="ml-1 font-body text-tiny font-medium text-silver">
                  / 100
                </span>
              </span>
            </div>
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-hairline">
              <span
                className={`block h-full rounded-full ${ACCENT_FILL[pin.type]}`}
                style={{ width: `${pin.impactScore}%` }}
              />
            </div>
          </div>

          {/* Damian's fix */}
          <div className="mt-3.5">
            <p className="text-micro font-semibold uppercase text-silver">
              Damian proposes
            </p>
            <p className="mt-2 text-pretty text-tiny leading-[1.65] text-chalk">{pin.suggestedFix}</p>
          </div>

          <button
            type="button"
            onClick={() => onGenerateFix(pin)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-cobalt px-5 py-3 text-tiny font-bold text-chalk transition-transform duration-300 ease-instrument hover:scale-[1.02] active:scale-[0.99]"
          >
            <Code2 aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.2} />
            Generate Fix Code
          </button>
        </div>
      </motion.div>
    </div>
  );
}
