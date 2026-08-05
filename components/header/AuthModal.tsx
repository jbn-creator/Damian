'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Lock, ShieldCheck, User, X } from 'lucide-react';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import type { TestCredentials } from '@/lib/types';

interface AuthModalProps {
  open: boolean;
  credentials: TestCredentials | null;
  onSave: (next: TestCredentials) => void;
  onClear: () => void;
  onClose: () => void;
}

const FIELD_CLASS =
  'w-full rounded-full border border-hairline bg-void py-3 pl-11 pr-4 text-[0.8125rem] font-medium text-chalk transition-shadow duration-300 ease-instrument placeholder:text-silver focus-visible:outline-none focus-visible:accent-glow';

/**
 * Credentials modal.
 *
 * Built on the native dialog element and opened with showModal, so focus is
 * trapped and Escape is handled by the platform rather than by a hand rolled
 * key listener. Escape is intercepted only long enough to let the Framer
 * Motion exit run before the element actually closes.
 */
export function AuthModal({
  open,
  credentials,
  onSave,
  onClear,
  onClose,
}: AuthModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const usernameId = useId();
  const passwordId = useId();
  const reduced = usePrefersReducedMotion();

  const [username, setUsername] = useState(credentials?.username ?? '');
  const [password, setPassword] = useState(credentials?.password ?? '');

  /*
   * Open the dialog. Closing is deferred until the exit animation resolves.
   *
   * showModal moves focus to the first focusable element, which is the close
   * button. Damian is asking for a username, so focus is moved to that field
   * on the frame after the dialog enters the top layer.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();

    const frame = requestAnimationFrame(() => {
      usernameRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  /* Rehydrate the fields from session state each time Damian is asked again. */
  useEffect(() => {
    if (!open) return;
    setUsername(credentials?.username ?? '');
    setPassword(credentials?.password ?? '');
  }, [open, credentials]);

  /* Escape and backdrop dismissal both route through onClose. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };

    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const handleExitComplete = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({ username, password });
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 h-full w-full items-center justify-center"
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="grid min-h-full place-items-center p-5">
        <AnimatePresence onExitComplete={handleExitComplete}>
          {open ? (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: 0.34, ease: [0.16, 0.84, 0.24, 1] }
              }
              className="w-full max-w-lg rounded-3xl border border-hairline bg-obsidian p-6 shadow-panel sm:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-cobalt/40 bg-cobalt/10">
                    <KeyRound
                      aria-hidden="true"
                      className="h-4 w-4 text-cobalt"
                      strokeWidth={2}
                    />
                  </span>
                  <div>
                    <h2
                      id="auth-modal-title"
                      className="font-display text-xl font-bold leading-tight tracking-cut text-chalk"
                    >
                      Test credentials
                    </h2>
                    <p className="mt-1.5 text-tiny leading-5 text-silver">
                      Give Damian a login and he will inspect the gated screens
                      behind it, not just the front door.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline text-silver transition-colors duration-200 ease-instrument hover:border-silver/50 hover:text-chalk"
                >
                  <span className="sr-only">Close credentials dialog</span>
                  <X aria-hidden="true" className="h-4 w-4" strokeWidth={2.2} />
                </button>
              </div>

              <form className="mt-7 flex flex-col gap-3.5" onSubmit={handleSubmit}>
                <div>
                  <label
                    htmlFor={usernameId}
                    className="mb-2 block text-micro font-semibold uppercase text-silver"
                  >
                    Test username
                  </label>
                  <div className="relative flex items-center">
                    <User
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 h-4 w-4 text-silver"
                      strokeWidth={2}
                    />
                    <input
                      id={usernameId}
                      ref={usernameRef}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="damian@yourproduct.com"
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={passwordId}
                    className="mb-2 block text-micro font-semibold uppercase text-silver"
                  >
                    Test password
                  </label>
                  <div className="relative flex items-center">
                    <Lock
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 h-4 w-4 text-silver"
                      strokeWidth={2}
                    />
                    <input
                      id={passwordId}
                      type="password"
                      autoComplete="off"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Session only. Never stored."
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>

                <p className="mt-1 flex items-start gap-2 text-tiny leading-5 text-silver">
                  <ShieldCheck
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald"
                    strokeWidth={2}
                  />
                  Credentials stay in this browser session. Nothing is sent
                  anywhere and nothing is written to disk.
                </p>

                <div className="mt-4 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                  {credentials ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClear();
                        setUsername('');
                        setPassword('');
                      }}
                      className="rounded-full border border-hairline px-5 py-3 text-tiny font-semibold text-silver transition-colors duration-200 ease-instrument hover:border-crimson/50 hover:text-crimson sm:mr-auto"
                    >
                      Forget credentials
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-hairline px-5 py-3 text-tiny font-semibold text-silver transition-colors duration-200 ease-instrument hover:border-silver/50 hover:text-chalk"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="rounded-full bg-cobalt px-6 py-3 text-tiny font-bold text-chalk transition-transform duration-300 ease-instrument hover:scale-[1.02] active:scale-[0.99]"
                  >
                    Hand to Damian
                  </button>
                </div>
              </form>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </dialog>
  );
}
