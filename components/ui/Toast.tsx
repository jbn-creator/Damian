'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import type { Toast, ToastTone } from '@/lib/types';

interface ToastContextValue {
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const LIFESPAN = 3600;

const TONE_ICON: Record<ToastTone, typeof Check> = {
  accent: Info,
  success: Check,
  warning: TriangleAlert,
};

const TONE_TEXT: Record<ToastTone, string> = {
  accent: 'text-cobalt',
  success: 'text-emerald',
  warning: 'text-amber',
};

const TONE_RING: Record<ToastTone, string> = {
  accent: 'border-cobalt/40 bg-cobalt/10',
  success: 'border-emerald/40 bg-emerald/10',
  warning: 'border-amber/40 bg-amber/10',
};

/**
 * Framer Motion owns every toast transform. Nothing else touches these nodes.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const reduced = usePrefersReducedMotion();

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      setToasts((current) => [...current.slice(-2), { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), LIFESPAN),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ul
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-8"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = TONE_ICON[toast.tone];
            return (
              <motion.li
                key={toast.id}
                layout={reduced ? false : 'position'}
                initial={reduced ? false : { opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduced
                    ? { opacity: 0 }
                    : { opacity: 0, y: 10, scale: 0.97, filter: 'blur(2px)' }
                }
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
                }
                className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-full border border-hairline bg-obsidian/95 py-2.5 pl-3.5 pr-2.5 shadow-panel backdrop-blur-xl"
              >
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border ${TONE_RING[toast.tone]}`}
                >
                  <Icon
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 ${TONE_TEXT[toast.tone]}`}
                    strokeWidth={2.4}
                  />
                </span>

                <span className="min-w-0 flex-1 py-0.5">
                  <span className="block truncate text-[0.8125rem] font-semibold leading-5 text-chalk">
                    {toast.title}
                  </span>
                  {toast.detail ? (
                    <span className="mt-0.5 block truncate text-tiny leading-4 text-silver">
                      {toast.detail}
                    </span>
                  ) : null}
                </span>

                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-silver transition-colors duration-200 ease-instrument hover:bg-hairline hover:text-chalk"
                >
                  <span className="sr-only">Dismiss notification</span>
                  <X aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider.');
  }
  return context;
}
