'use client';

/**
 * The captured surface: a simulated render of the target application.
 *
 * Two rules govern this file.
 *
 * 1. Every dimension is a percentage of a fixed aspect container. That means
 *    the surface renders identically at 240px wide and at 1200px wide, which
 *    is what lets PinPopover reuse it at 3x as a genuine zoomed crop rather
 *    than a separate fake.
 * 2. It is drawn entirely from the five core tokens plus one accent. It reads
 *    as a wireframe capture, so it never competes with Damian's pins for
 *    attention. Color on this canvas means a finding.
 */

type Tone = 'strong' | 'mid' | 'soft' | 'accent';

const TONE_CLASS: Record<Tone, string> = {
  strong: 'bg-chalk/80',
  mid: 'bg-silver/40',
  soft: 'bg-hairline',
  accent: 'bg-cobalt/70',
};

interface BlockProps {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: Tone;
  round?: 'full' | 'xl' | '2xl';
}

/** A single wireframe element, positioned in percentages. */
function Block({ x, y, w, h, tone = 'soft', round = 'full' }: BlockProps) {
  const radius =
    round === 'full' ? 'rounded-full' : round === 'xl' ? 'rounded-xl' : 'rounded-2xl';
  return (
    <span
      aria-hidden="true"
      className={`absolute ${TONE_CLASS[tone]} ${radius}`}
      style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
    />
  );
}

/** Seven stacked field rows. The finding Damian pins is literally countable. */
function SignupFields() {
  const rows = [0, 1, 2, 3, 4, 5, 6];
  return (
    <>
      {rows.map((row) => (
        <Block
          key={`field-${row}`}
          x={59}
          y={23.5 + row * 4.6}
          w={33}
          h={3.1}
          tone="soft"
        />
      ))}
    </>
  );
}

/**
 * The dashboard chart. Deliberately the best composed region on the page.
 *
 * Bars take the xl radius, not the full one. At this scale a bar is roughly as
 * wide as it is tall, and a full radius turns the short columns into circles.
 */
function ChartBars() {
  const heights = [4.2, 6.8, 5.1, 8.4, 7.2, 9.6, 6.4, 10.8, 8.2, 11.4];
  return (
    <>
      {heights.map((height, index) => (
        <Block
          key={`bar-${index}`}
          x={8.4 + index * 8.4}
          y={95 - height}
          w={3.6}
          h={height}
          tone={index === heights.length - 1 ? 'accent' : 'mid'}
          round="xl"
        />
      ))}
    </>
  );
}

export function CapturedSurface({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative aspect-[16/10] w-full overflow-hidden bg-void ${className}`}
    >
      {/* Application chrome */}
      <span className="absolute inset-x-0 top-0 h-[8%] border-b border-hairline bg-obsidian" />
      <Block x={3} y={2.8} w={2.4} h={2.4} tone="accent" />
      <Block x={6.4} y={3.2} w={7} h={1.6} tone="strong" />
      <Block x={38} y={3.4} w={5.4} h={1.3} tone="mid" />
      <Block x={45} y={3.4} w={5.4} h={1.3} tone="mid" />
      <Block x={52} y={3.4} w={5.4} h={1.3} tone="mid" />
      <Block x={59} y={3.4} w={5.4} h={1.3} tone="mid" />
      <Block x={88} y={3} w={3.2} h={2.6} tone="mid" />
      <Block x={92.6} y={2.8} w={2.6} h={2.9} tone="soft" />

      {/* Hero, left column. The headline Damian flags for missing an outcome. */}
      <Block x={5} y={16} w={11} h={2.2} tone="accent" />
      <Block x={5} y={23} w={40} h={4.4} tone="strong" round="xl" />
      <Block x={5} y={29.5} w={28} h={4.4} tone="strong" round="xl" />
      <Block x={5} y={37.5} w={36} h={2} tone="mid" />
      <Block x={5} y={41} w={30} h={2} tone="mid" />
      <Block x={5} y={48} w={13} h={4.6} tone="accent" />
      <Block x={20} y={48} w={13} h={4.6} tone="soft" />

      {/* Hero, right column. The 7 field capture. */}
      <span className="absolute rounded-2xl border border-hairline bg-obsidian" style={{ left: '56%', top: '15%', width: '39%', height: '44%' }} />
      <Block x={59} y={18.5} w={16} h={2.4} tone="strong" />
      <SignupFields />
      <Block x={59} y={51.5} w={33} h={4.2} tone="accent" />

      {/* Section break */}
      <span className="absolute inset-x-0 border-t border-hairline" style={{ top: '64%' }} />

      {/* Dashboard grid. The region Damian pins as a win. */}
      <Block x={5} y={67} w={14} h={1.8} tone="strong" />
      {[0, 1, 2, 3].map((tile) => (
        <span
          key={`tile-${tile}`}
          aria-hidden="true"
          className="absolute rounded-2xl border border-hairline bg-obsidian"
          style={{ left: `${5 + tile * 23}%`, top: '71%', width: '20%', height: '11%' }}
        />
      ))}
      {[0, 1, 2, 3].map((tile) => (
        <Block
          key={`tile-label-${tile}`}
          x={7 + tile * 23}
          y={73.5}
          w={9}
          h={1.4}
          tone="mid"
        />
      ))}
      {[0, 1, 2, 3].map((tile) => (
        <Block
          key={`tile-value-${tile}`}
          x={7 + tile * 23}
          y={76.8}
          w={tile === 0 ? 12 : 7}
          h={tile === 0 ? 3.4 : 2.6}
          tone={tile === 0 ? 'strong' : 'mid'}
          round="xl"
        />
      ))}
      <ChartBars />
    </div>
  );
}
