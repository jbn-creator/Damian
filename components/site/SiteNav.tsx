'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/try', label: 'Try Damian' },
];

/**
 * The global nav. Two destinations and a mark, and nothing else in it.
 *
 * No inputs live here. The launcher is a composer in the middle of the Try
 * Damian screen, where a person expects to type.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="relative z-40 w-full">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-[1800px] items-center gap-8 px-5 sm:h-20 sm:px-8"
      >
        <Link
          href="/"
          aria-label="Damian, home"
          className="group flex shrink-0 items-center gap-3 rounded-full"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-obsidian transition-colors duration-300 ease-instrument group-hover:border-silver/50">
            <span className="font-display text-base font-bold leading-none tracking-cut text-chalk">
              D
            </span>
          </span>
        </Link>

        <ul className="flex items-center gap-1 sm:gap-2">
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative block rounded-full px-3 py-2 text-[0.9375rem] font-medium transition-colors duration-200 ease-instrument sm:px-4 ${
                    active ? 'text-chalk' : 'text-silver hover:text-chalk'
                  }`}
                >
                  {link.label}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-chalk sm:inset-x-4"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
