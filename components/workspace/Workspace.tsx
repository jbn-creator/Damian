'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Composer } from './Composer';
import { SessionBar } from './SessionBar';
import { AuthModal } from './AuthModal';
import { AgentCanvas } from '@/components/canvas/AgentCanvas';
import { CommandCenter } from '@/components/command/CommandCenter';
import { useToast } from '@/components/ui/Toast';
import { useDamian } from '@/lib/use-damian';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

type Phase = 'composer' | 'splitting' | 'session';

/**
 * The Try Damian surface.
 *
 * Two states and the transition between them. A composer sits in the middle of
 * the screen until a target is handed over, then the screen splits along a
 * seam and the two working panels are revealed outward from it.
 *
 * GSAP owns that transition, as it owns every orchestrated timeline in the
 * app. It writes clipPath on the workspace shell and transform on the seam and
 * the composer. Framer Motion is not involved at this level, only inside the
 * panels it reveals.
 */
export function Workspace() {
  const damian = useDamian();
  const { push } = useToast();
  const reduced = usePrefersReducedMotion();

  const [phase, setPhase] = useState<Phase>('composer');
  const [authOpen, setAuthOpen] = useState(false);

  const composerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const seamRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  const handleLaunch = useCallback(() => {
    if (damian.url.trim().length === 0) return;
    setPhase((current) => (current === 'composer' ? 'splitting' : current));
  }, [damian.url]);

  /* The split. Runs once, when the composer hands over a target. */
  useEffect(() => {
    if (phase !== 'splitting') return;

    const shell = shellRef.current;
    const seam = seamRef.current;
    const composer = composerRef.current;
    const canvas = canvasRef.current;
    const aside = asideRef.current;
    const bar = barRef.current;
    if (!shell || !seam || !canvas || !aside || !bar) return;

    if (reduced) {
      gsap.set([canvas, aside, bar], { opacity: 1 });
      gsap.set(shell, { clipPath: 'inset(0% 0% 0% 0%)' });
      gsap.set(seam, { opacity: 0 });
      if (composer) gsap.set(composer, { opacity: 0 });
      setPhase('session');
      damian.launch();
      return;
    }

    const timeline = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        gsap.set(shell, { clearProps: 'clipPath' });
        setPhase('session');
      },
    });

    gsap.set([canvas, aside], { opacity: 1 });
    gsap.set(shell, { clipPath: 'inset(0% 50% 0% 50%)' });
    gsap.set(seam, { opacity: 1, scaleY: 0, transformOrigin: '50% 50%' });

    timeline
      /* The composer stands down. */
      .to(
        composer,
        { opacity: 0, y: -22, scale: 0.97, duration: 0.34, ease: 'power2.in' },
        0,
      )
      /* A seam is drawn down the middle. */
      .to(seam, { scaleY: 1, duration: 0.42, ease: 'power3.inOut' }, 0.16)
      /* The screen divides, revealing both panels outward from the seam. */
      .to(
        shell,
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 0.92,
          ease: 'power4.inOut',
        },
        0.46,
      )
      .to(seam, { opacity: 0, duration: 0.34, ease: 'power2.out' }, 0.72)
      .fromTo(
        bar,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.42 },
        0.86,
      )
      /* Damian starts reading before the panels have finished arriving. */
      .call(() => damian.launch(), undefined, 0.98);

    return () => {
      timeline.kill();
    };
    /* Intentionally keyed to the phase change alone: this plays exactly once. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reduced]);

  /* Damian announces the board at the end of each run. */
  useEffect(() => {
    if (!damian.hasCompleted) return;
    push({
      tone: 'success',
      title: 'Damian finished the pass.',
      detail: `${damian.ideas.length} opportunities on the board. ${damian.pins.length} pins on the canvas.`,
    });
  }, [damian.hasCompleted, damian.ideas.length, damian.pins.length, push]);

  const handleNewTarget = () => {
    damian.reset();
    setPhase('composer');
  };

  const showComposer = phase !== 'session';
  const showSession = phase !== 'composer';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Composer state */}
      {showComposer ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center py-10">
          <Composer
            ref={composerRef}
            url={damian.url}
            onUrlChange={damian.setUrl}
            credentials={damian.credentials}
            onOpenAuth={() => setAuthOpen(true)}
            onLaunch={handleLaunch}
          />
        </div>
      ) : null}

      {/* The seam the screen divides along. */}
      {phase === 'splitting' ? (
        <span
          ref={seamRef}
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 z-30 w-px bg-cobalt opacity-0 accent-glow"
        />
      ) : null}

      {/* Session state */}
      {showSession ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={barRef} className="opacity-0">
            <SessionBar
              url={damian.url}
              state={damian.state}
              activity={damian.activity}
              progress={damian.progress}
              isRunning={damian.isRunning}
              credentials={damian.credentials}
              onRerun={damian.launch}
              onNewTarget={handleNewTarget}
              onOpenAuth={() => setAuthOpen(true)}
            />
          </div>

          {/*
            The shell the clipPath opens. Both panels are laid out at their
            final size the whole time, so nothing reflows as the split runs.
          */}
          <div ref={shellRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
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
          </div>
        </div>
      ) : null}

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
