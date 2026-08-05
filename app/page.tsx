'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ControlBar } from '@/components/header/ControlBar';
import { AuthModal } from '@/components/header/AuthModal';
import { AgentCanvas } from '@/components/canvas/AgentCanvas';
import { CommandCenter } from '@/components/command/CommandCenter';
import { useToast } from '@/components/ui/Toast';
import { useDamian } from '@/lib/use-damian';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

export default function WorkspacePage() {
  const damian = useDamian();
  const [authOpen, setAuthOpen] = useState(false);
  const { push } = useToast();
  const reduced = usePrefersReducedMotion();

  const headerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  /**
   * GSAP owns the orchestrated entrance: header, then canvas, then sidebar.
   * All three wrappers render from the opacity-0 class, so GSAP's inline styles
   * take over before first paint reveals anything. Transform is cleared on
   * completion so the panels do not leave a containing block behind them.
   */
  useEffect(() => {
    const header = headerRef.current;
    const canvas = canvasRef.current;
    const aside = asideRef.current;
    if (!header || !canvas || !aside) return;

    const targets = [header, canvas, aside];

    if (reduced) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }

    const timeline = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => gsap.set(targets, { clearProps: 'transform' }),
    });

    timeline
      .fromTo(header, { opacity: 0, y: -18 }, { opacity: 1, y: 0, duration: 0.5 })
      .fromTo(canvas, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.66 }, '-=0.26')
      .fromTo(aside, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.66 }, '-=0.48');

    return () => {
      timeline.kill();
    };
  }, [reduced]);

  /* Damian announces the board once, at the end of each run. */
  useEffect(() => {
    if (!damian.hasCompleted) return;
    push({
      tone: 'success',
      title: 'Damian finished the pass.',
      detail: `${damian.ideas.length} opportunities on the board. ${damian.pins.length} pins on the canvas.`,
    });
  }, [damian.hasCompleted, damian.ideas.length, damian.pins.length, push]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-void">
      <ControlBar
        ref={headerRef}
        url={damian.url}
        onUrlChange={damian.setUrl}
        state={damian.state}
        activity={damian.activity}
        progress={damian.progress}
        isRunning={damian.isRunning}
        hasCompleted={damian.hasCompleted}
        credentials={damian.credentials}
        onLaunch={damian.launch}
        onOpenAuth={() => setAuthOpen(true)}
      />

      {/*
        The split. 60 / 40 at the large breakpoint with two independent scroll
        regions. Below it, a deliberate stack: canvas on top with its pins still
        tappable, command center beneath it as a sheet.
      */}
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <AgentCanvas
          ref={canvasRef}
          url={damian.url}
          state={damian.state}
          pins={damian.pins}
          isRunning={damian.isRunning}
        />

        <CommandCenter
          ref={asideRef}
          logs={damian.logs}
          ideas={damian.ideas}
          metrics={damian.metrics}
          targetUrl={damian.url}
          isRunning={damian.isRunning}
        />
      </main>

      <AuthModal
        open={authOpen}
        credentials={damian.credentials}
        onSave={(next) => {
          damian.saveCredentials(next);
          push({
            tone: 'accent',
            title: 'Credentials handed to Damian.',
            detail: 'He will sign in and inspect the gated screens on the next run.',
          });
        }}
        onClear={() => {
          damian.clearCredentials();
          push({
            tone: 'accent',
            title: 'Credentials cleared.',
            detail: 'Damian will only see what a signed out visitor sees.',
          });
        }}
        onClose={() => setAuthOpen(false)}
      />
    </div>
  );
}
