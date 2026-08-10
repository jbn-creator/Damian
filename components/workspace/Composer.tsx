'use client';

import { forwardRef, useId } from 'react';
import { ArrowUp, KeyRound, Link2 } from 'lucide-react';
import type { TestCredentials } from '@/lib/types';

interface ComposerProps {
  url: string;
  onUrlChange: (next: string) => void;
  credentials: TestCredentials | null;
  onOpenAuth: () => void;
  onLaunch: () => void;
}

const EXAMPLES = [
  'https://app.yourproduct.com',
  'https://dashboard.acme.io',
  'https://console.northwind.dev',
];

/**
 * The launcher.
 *
 * A composer in the middle of the screen, where a person expects to type, with
 * the action as a send button inside it. No part of this lives in the nav.
 */
export const Composer = forwardRef<HTMLDivElement, ComposerProps>(
  function Composer({ url, onUrlChange, credentials, onOpenAuth, onLaunch }, ref) {
    const fieldId = useId();
    const ready = url.trim().length > 0;

    return (
      <div ref={ref} className="mx-auto w-full max-w-2xl px-5 sm:px-8">
        <h1 className="text-balance text-center font-display text-[clamp(1.875rem,5vw,3rem)] font-bold leading-[1.05] tracking-cut text-chalk">
          What should Damian inspect?
        </h1>
        <p className="mx-auto mt-4 max-w-md text-pretty text-center text-tiny leading-relaxed text-silver sm:text-[0.9375rem]">
          Give him a URL. He opens the session, reads the interface, and pins
          what he finds while you watch.
        </p>

        <form
          className="mt-9"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) onLaunch();
          }}
        >
          <label htmlFor={fieldId} className="sr-only">
            Target application URL
          </label>

          {/*
            The visible focus indicator is the accent glow on this surface,
            which transitions in rather than snapping. The field's own outline
            is suppressed so the two do not stack.
          */}
          <div className="rounded-3xl border border-hairline bg-obsidian p-2.5 transition-shadow duration-300 ease-instrument focus-within:accent-glow">
            <div className="relative flex items-center">
              <Link2
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 h-4 w-4 text-silver"
                strokeWidth={2}
              />
              {/*
                Text, not url. Native url validation rejects a bare domain, so
                the form silently refuses to submit when someone types
                craigslist.org. The target is validated on the server, which
                can also explain itself when it says no.
              */}
              <input
                id={fieldId}
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                placeholder="https://app.yourproduct.com"
                className="w-full bg-transparent px-4 py-3 pl-11 text-[0.9375rem] font-medium text-chalk placeholder:text-silver focus-visible:outline-none"
              />
            </div>

            <div className="mt-1.5 flex items-center gap-2 px-1.5 pb-0.5">
              <button
                type="button"
                onClick={onOpenAuth}
                className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1.5 text-tiny font-semibold text-silver transition-colors duration-200 ease-instrument hover:border-silver/50 hover:text-chalk"
              >
                <KeyRound aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                Credentials
                {credentials ? (
                  <span
                    role="img"
                    aria-label="Saved"
                    className="h-1.5 w-1.5 rounded-full bg-emerald"
                  />
                ) : null}
              </button>

              <span className="ml-auto" />

              <button
                type="submit"
                disabled={!ready}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-chalk text-void transition-transform duration-300 ease-instrument hover:scale-[1.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-silver disabled:hover:scale-100"
              >
                <span className="sr-only">Launch Damian</span>
                <ArrowUp aria-hidden="true" className="h-4 w-4" strokeWidth={2.6} />
              </button>
            </div>
          </div>
        </form>

        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => onUrlChange(example)}
                className="rounded-full border border-hairline px-3 py-1.5 text-tiny font-medium text-silver transition-colors duration-200 ease-instrument hover:border-silver/50 hover:text-chalk"
              >
                {example.replace('https://', '')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  },
);
