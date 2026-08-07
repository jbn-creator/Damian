import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Plus_Jakarta_Sans } from 'next/font/google';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

/**
 * Display face. Space Grotesk is the neutral geometric grotesque the direction
 * calls for: wide circular bowls, a flat crossbar, and enough character at
 * 9rem that a one word headline can carry a whole screen on its own.
 */
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

/**
 * Body and numeric face. Plus Jakarta Sans has real tabular figures, which is
 * what keeps Damian's telemetry timestamps in a true column.
 */
const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Damian / Visual Product Intelligence Agent',
  description:
    'Describe the product in the browser, and let Damian handle the rest. He opens a live session, inspects the interface, pins the friction he finds, and assembles a board of product opportunities while you watch.',
  applicationName: 'Damian',
  authors: [{ name: 'Metics Media' }],
};

export const viewport: Viewport = {
  themeColor: '#08090C',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-void font-body text-chalk antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
