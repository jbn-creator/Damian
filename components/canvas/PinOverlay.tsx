'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { PinMarker } from './PinMarker';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import type { AuditPin } from '@/lib/types';

interface PinOverlayProps {
  pins: AuditPin[];
  /** Current canvas zoom step. Pins counter scale so they stay readable. */
  zoom: number;
  visible: boolean;
  openPinId: string | null;
  onTogglePin: (pinId: string) => void;
  popoverIdFor: (pinId: string) => string;
  registerMarker: (pinId: string, node: HTMLButtonElement | null) => void;
}

/**
 * Pin overlay.
 *
 * GSAP owns the drop sequence and writes transform and opacity on the anchor
 * elements. Anchors start from the opacity-0 class so nothing flashes before
 * the timeline takes over, and GSAP's inline styles then outrank the class.
 */
export function PinOverlay({
  pins,
  zoom,
  visible,
  openPinId,
  onTogglePin,
  popoverIdFor,
  registerMarker,
}: PinOverlayProps) {
  const anchors = useRef(new Map<string, HTMLLIElement>());
  const dropped = useRef(new Set<string>());
  const tweens = useRef<gsap.core.Tween[]>([]);
  const reduced = usePrefersReducedMotion();

  /*
   * Tweens are killed on unmount only. Killing them from the effect cleanup
   * would abort the drop of the previous pin the moment the next one arrives,
   * freezing it part way through its landing.
   */
  useEffect(
    () => () => {
      tweens.current.forEach((tween) => tween.kill());
      tweens.current = [];
    },
    [],
  );

  useEffect(() => {
    /* A relaunch clears the board, so the next run animates from scratch. */
    if (pins.length === 0) {
      dropped.current.clear();
      tweens.current.forEach((tween) => tween.kill());
      tweens.current = [];
      return;
    }

    const fresh = pins.filter((pin) => !dropped.current.has(pin.id));
    if (fresh.length === 0) return;

    const targets = fresh
      .map((pin) => anchors.current.get(pin.id))
      .filter((node): node is HTMLLIElement => Boolean(node));

    fresh.forEach((pin) => dropped.current.add(pin.id));
    if (targets.length === 0) return;

    if (reduced) {
      gsap.set(targets, { opacity: 1, scale: 1, y: 0 });
      return;
    }

    /* Damian places a pin. The small overshoot is the landing, and it earns it. */
    tweens.current = tweens.current.filter((tween) => tween.isActive());
    tweens.current.push(
      gsap.fromTo(
        targets,
        { opacity: 0, scale: 0.2, y: -22 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.52,
          ease: 'back.out(1.8)',
          stagger: 0.14,
        },
      ),
    );
  }, [pins, reduced]);

  return (
    <ul
      aria-label="Damian's feedback pins"
      inert={!visible}
      className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ease-instrument ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {pins.map((pin, index) => (
        <li
          key={pin.id}
          ref={(node) => {
            if (node) anchors.current.set(pin.id, node);
            else anchors.current.delete(pin.id);
          }}
          className="absolute h-0 w-0 opacity-0"
          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
        >
          {/*
            Counter scale against canvas zoom. Inline style is the single writer
            of this element's transform, so the pin tracks the feature it marks
            without growing with it.
          */}
          <span
            className="absolute block transition-transform duration-300 ease-instrument"
            style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
          >
            <span className="pointer-events-auto block">
              <PinMarker
                ref={(node) => registerMarker(pin.id, node)}
                pin={pin}
                index={index}
                isOpen={openPinId === pin.id}
                popoverId={popoverIdFor(pin.id)}
                onToggle={(event) => {
                  /*
                    The canvas closes the popover on any click that lands on it.
                    Without this, opening a pin and closing it happen in the
                    same event and the popover never appears.
                  */
                  event.stopPropagation();
                  onTogglePin(pin.id);
                }}
              />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
