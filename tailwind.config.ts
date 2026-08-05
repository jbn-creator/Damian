import type { Config } from 'tailwindcss';

/**
 * Damian design system.
 *
 * Two deliberate constraints are enforced here rather than by review:
 *
 * 1. `colors` is replaced, not extended. There are five core tokens and three
 *    status tokens. Any hex outside that set fails to compile as a utility.
 * 2. `borderRadius` is replaced so `rounded-none`, `rounded-sm` and
 *    `rounded-md` do not exist. The rounded system cannot be violated by
 *    accident.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',

      /* Core: background */
      void: '#08090C',
      /* Core: surface and its hairline */
      obsidian: '#12141A',
      hairline: '#232733',
      /* Core: text primary */
      chalk: '#F3F4F6',
      /* Core: text muted */
      silver: '#8E95A5',
      /* Core: accent */
      cobalt: '#6366F1',

      /* Status. Semantic state only. Never decoration. */
      crimson: '#EF4444',
      amber: '#F59E0B',
      emerald: '#10B981',
    },
    borderRadius: {
      xl: '0.75rem',
      '2xl': '1rem',
      '3xl': '1.5rem',
      '4xl': '2rem',
      full: '9999px',
    },
    fontFamily: {
      display: ['var(--font-display)', 'sans-serif'],
      body: ['var(--font-body)', 'sans-serif'],
    },
    extend: {
      fontSize: {
        micro: ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.14em' }],
        tiny: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
      },
      letterSpacing: {
        cut: '-0.045em',
        wider: '0.08em',
        widest: '0.2em',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(99, 102, 241, 0.45), 0 8px 32px rgba(99, 102, 241, 0.22)',
        lift: '0 18px 48px rgba(8, 9, 12, 0.72)',
        panel: '0 24px 64px rgba(8, 9, 12, 0.86)',
      },
      transitionTimingFunction: {
        /* Custom curves. Nothing here is a default ease. */
        instrument: 'cubic-bezier(0.22, 1, 0.36, 1)',
        settle: 'cubic-bezier(0.16, 0.84, 0.24, 1)',
        cut: 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      keyframes: {
        /* Decorative loops live in CSS so neither GSAP nor Framer owns them. */
        'pulse-ring': {
          '0%': { transform: 'scale(0.72)', opacity: '0.7' },
          '70%': { transform: 'scale(2.1)', opacity: '0' },
          '100%': { transform: 'scale(2.1)', opacity: '0' },
        },
        'scan-sweep': {
          '0%': { transform: 'translateY(-30%)', opacity: '0' },
          '12%': { opacity: '1' },
          '88%': { opacity: '1' },
          '100%': { transform: 'translateY(130%)', opacity: '0' },
        },
        breathe: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.86)' },
        },
        caret: {
          '0%, 45%': { opacity: '1' },
          '46%, 100%': { opacity: '0' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.6s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        'scan-sweep': 'scan-sweep 2.4s cubic-bezier(0.65, 0, 0.35, 1) infinite',
        breathe: 'breathe 2s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        caret: 'caret 1.1s steps(1, end) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
