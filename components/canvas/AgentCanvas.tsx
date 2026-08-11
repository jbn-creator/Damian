'use client';

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Radar, ScanLine } from 'lucide-react';
import { BrowserChrome } from './BrowserChrome';
import { CanvasControls } from './CanvasControls';
import { CapturedSurface } from './CapturedSurface';
import { NoteOverlay } from './NoteOverlay';
import { PinPopover, type PinPlacement } from './PinPopover';
import { copyToClipboard } from '@/lib/clipboard';
import { useIsCompact, usePrefersReducedMotion } from '@/lib/use-media-query';
import { useToast } from '@/components/ui/Toast';
import type { AuditPin, DamianState, ViewportSize } from '@/lib/types';
import type { CapturedPage } from '@/lib/use-damian';

interface AgentCanvasProps {
  url: string;
  state: DamianState;
  /** Notes revealed so far on the page being shown. */
  notes: AuditPin[];
  isRunning: boolean;
  /** Every page walked so far. */
  pages: CapturedPage[];
  activePage: number;
  onSelectPage: (index: number) => void;
  /** What Damian is looking at right now, while he is still walking. */
  liveFrame: string | null;
}

const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * The canvas.
 *
 * Layer order matters here. The captured surface and the pin overlay live
 * inside the zoom wrapper so pins track the features they mark. The popover
 * lives outside it, positioned from zoom adjusted coordinates, so its type is
 * never scaled and its anchor can flip without fighting the transform above it.
 */
export const AgentCanvas = forwardRef<HTMLElement, AgentCanvasProps>(
  function AgentCanvas(
    { url, state, notes, isRunning, pages, activePage, onSelectPage, liveFrame },
    ref,
  ) {
    const page = pages[activePage] ?? null;
    const screenshot = page?.screenshot ?? null;
    const pins = notes;
    const [viewport, setViewport] = useState<ViewportSize>('desktop');
    const [zoomIndex, setZoomIndex] = useState(0);
    const [pinsVisible, setPinsVisible] = useState(true);
    const [openPinId, setOpenPinId] = useState<string | null>(null);

    const markers = useRef(new Map<string, HTMLButtonElement>());
    const isCompact = useIsCompact();
    const reduced = usePrefersReducedMotion();
    const { push } = useToast();

    const zoom = ZOOM_STEPS[zoomIndex];

    const registerMarker = useCallback(
      (pinId: string, node: HTMLButtonElement | null) => {
        if (node) markers.current.set(pinId, node);
        else markers.current.delete(pinId);
      },
      [],
    );

    const closePopover = useCallback(() => {
      if (openPinId) markers.current.get(openPinId)?.focus({ preventScroll: true });
      setOpenPinId(null);
    }, [openPinId]);

    /* Escape closes the popover and returns focus to the pin that opened it. */
    useEffect(() => {
      if (!openPinId) return;
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') closePopover();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [openPinId, closePopover]);

    /* A relaunch clears the board, and a hidden pin cannot hold a popover. */
    useEffect(() => {
      if (pins.length === 0 || !pinsVisible) setOpenPinId(null);
    }, [pins.length, pinsVisible]);

    const openPin = useMemo(
      () => pins.find((pin) => pin.id === openPinId) ?? null,
      [pins, openPinId],
    );

    const openPinIndex = openPin ? pins.indexOf(openPin) : -1;

    /**
     * Placement. Coordinates are recomputed against the current zoom step and
     * clamped inside the frame, then flipped so the panel cannot render outside
     * the canvas bounds on any side.
     */
    const placement = useMemo<PinPlacement | null>(() => {
      if (!openPin) return null;
      const x = clamp(50 + (openPin.x - 50) * zoom, 4, 96);
      const y = clamp(50 + (openPin.y - 50) * zoom, 4, 96);
      return {
        side: x > 54 ? 'left' : 'right',
        align: y < 32 ? 'top' : y > 68 ? 'bottom' : 'center',
        compact: isCompact,
        x,
        y,
      };
    }, [openPin, zoom, isCompact]);

    const frameWidth =
      viewport === 'desktop'
        ? '100%'
        : viewport === 'tablet'
          ? isCompact
            ? '88%'
            : '78%'
          : isCompact
            ? '62%'
            : '46%';

    const handleGenerateFix = async (pin: AuditPin) => {
      const payload = `// Damian / fix for: ${pin.title}\n// Target: ${url}\n// Region: ${pin.x} percent from left, ${pin.y} percent from top\n// Impact score: ${pin.impactScore} of 100\n\n/*\n${pin.suggestedFix}\n*/\n`;
      const copied = await copyToClipboard(payload);
      push(
        copied
          ? {
              tone: 'success',
              title: 'Fix copied to your clipboard.',
              detail: pin.title,
            }
          : {
              tone: 'warning',
              title: 'Damian could not reach the clipboard.',
              detail: 'Your browser refused the write. Copy the text manually.',
            },
      );
    };

    const handleCapture = () => {
      push({
        tone: 'accent',
        title: 'Canvas captured.',
        detail: `${pins.length} pin${pins.length === 1 ? '' : 's'} held at ${Math.round(zoom * 100)} percent on the ${viewport} frame.`,
      });
    };

    /*
     * One popover instance, mounted in one of two parents. Floating anchors to
     * the capture frame so it can flip beside its pin. Compact anchors to the
     * canvas panel so the sheet is bounded by the space actually available.
     */
    const popoverNode =
      openPin && placement ? (
        <PinPopover
          key={openPin.id}
          pin={openPin}
          index={openPinIndex}
          placement={placement}
          screenshot={screenshot}
          popoverId={`popover-${openPin.id}`}
          onClose={closePopover}
          onGenerateFix={handleGenerateFix}
        />
      ) : null;

    return (
      <section
        ref={ref}
        aria-label="Damian's canvas"
        className="relative flex min-h-0 shrink-0 flex-col overflow-hidden border-hairline bg-void opacity-0 max-lg:h-[54%] lg:w-[60%] lg:shrink lg:border-r"
      >
        <BrowserChrome
          url={page?.url ?? url}
          viewport={viewport}
          onViewportChange={setViewport}
        />

        {/*
          The pages Damian walked. It follows him while he is still going, and
          becomes yours to move through once he stops.
        */}
        {pages.length > 1 ? (
          <nav
            aria-label="Pages Damian walked"
            className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline bg-obsidian/60 px-3 py-2"
          >
            {pages.map((walked, index) => {
              const current = index === activePage;
              const count = walked.notes.length;
              return (
                <button
                  key={walked.url}
                  type="button"
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onSelectPage(index)}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-tiny font-medium transition-colors duration-200 ease-instrument ${
                    current
                      ? 'border-cobalt/40 bg-cobalt/10 text-chalk'
                      : 'border-hairline text-silver hover:border-silver/50 hover:text-chalk'
                  }`}
                >
                  <span className="max-w-[11rem] truncate">{walked.label}</span>
                  {count > 0 ? (
                    <span
                      data-numeric
                      className={`rounded-full px-1.5 text-micro font-bold ${
                        current ? 'bg-cobalt/20 text-chalk' : 'bg-hairline text-silver'
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        ) : null}

        {/*
          Stage bounds. This wrapper is the positioning context for the compact
          sheet, so the sheet is bounded by the visible stage rather than by the
          scrollable content inside it.
        */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* The stage. Independent scroll region. */}
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto instrument-grid p-4 sm:p-6 lg:p-8"
            onClick={closePopover}
          >
            <div
              className="relative w-full transition-[width] duration-500 ease-instrument"
              style={{ width: frameWidth, maxWidth: '100%' }}
            >
              {/* Frame. Positioning context for both the clip and the popover. */}
              <div className="relative">
                <div className="relative overflow-hidden rounded-2xl border border-hairline bg-void shadow-panel">
                  {/* Zoom wrapper. Transform written here and nowhere else. */}
                  <div
                    className="relative origin-center transition-transform duration-500 ease-instrument"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    {/*
                      While he is walking you watch him. The still capture only
                      takes over once he has stopped and the notes are on it.
                    */}
                    <CapturedSurface src={liveFrame ?? screenshot} />
                    <NoteOverlay
                      notes={pins}
                      zoom={zoom}
                      visible={pinsVisible}
                      openNoteId={openPinId}
                      onToggleNote={(noteId) =>
                        setOpenPinId((current) => (current === noteId ? null : noteId))
                      }
                      registerNote={registerMarker}
                      spotlit={isRunning}
                    />
                  </div>

                  {/* Session state overlays. */}
                  <AnimatePresence>
                    {state === 'idle' ? (
                      <motion.div
                        key="idle"
                        initial={reduced ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={reduced ? { duration: 0 } : { duration: 0.4 }}
                        className="absolute inset-0 grid place-items-center bg-void/80 px-6 backdrop-blur-[3px]"
                      >
                        <div className="max-w-sm text-center">
                          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-hairline bg-obsidian">
                            <Radar
                              aria-hidden="true"
                              className="h-4 w-4 text-silver"
                              strokeWidth={2}
                            />
                          </span>
                          <p className="mt-4 font-display text-lg font-bold leading-tight tracking-cut text-chalk">
                            No session open.
                          </p>
                          <p className="mt-2 text-tiny leading-5 text-silver">
                            Give Damian a URL and he will open the page, read it,
                            and pin what he finds.
                          </p>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {/* Scan sweep. CSS keyframes, stopped by the reduced motion layer. */}
                  {isRunning ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan-sweep bg-cobalt/10"
                      style={{
                        maskImage: 'linear-gradient(to bottom, transparent, #08090C)',
                        WebkitMaskImage: 'linear-gradient(to bottom, transparent, #08090C)',
                      }}
                    />
                  ) : null}
                </div>

                {/* Popover layer. Outside the zoom wrapper, so type stays crisp. */}
                <AnimatePresence>{isCompact ? null : popoverNode}</AnimatePresence>
              </div>

              {/* Frame readout */}
              <p className="mt-3 flex items-center justify-center gap-2 text-micro font-semibold uppercase text-silver">
                <ScanLine aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                <span data-numeric>
                  {isRunning
                    ? `Walking the site. ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} so far.`
                    : pins.length > 0
                      ? `${pins.length} ${pins.length === 1 ? 'note' : 'notes'} on this page`
                      : 'Static capture. Awaiting instruction.'}
                </span>
              </p>
            </div>
          </div>

          {/* Compact sheet layer, bounded by the visible stage. */}
          <AnimatePresence>{isCompact ? popoverNode : null}</AnimatePresence>
        </div>

        <CanvasControls
          zoom={zoom}
          canZoomIn={zoomIndex < ZOOM_STEPS.length - 1}
          canZoomOut={zoomIndex > 0}
          onZoomIn={() => setZoomIndex((index) => Math.min(index + 1, ZOOM_STEPS.length - 1))}
          onZoomOut={() => setZoomIndex((index) => Math.max(index - 1, 0))}
          pinsVisible={pinsVisible}
          onTogglePins={() => setPinsVisible((visible) => !visible)}
          onCapture={handleCapture}
        />
      </section>
    );
  },
);
