# Damian

An autonomous Visual Product Intelligence Agent.

You hand Damian a URL and optional test credentials. He opens a session, reads
the interface, drops coordinate anchored feedback pins onto the capture, and
assembles a board of product improvement opportunities while you watch.

Damian is the product. He is not a chatbot and not a wrapper around a text box.

## Two screens

`/` is the landing page: one word at display scale with a live cursor, one line
of explanation, one action, and a poster of the product below it.

`/try` is the workspace. It opens as a composer in the middle of the screen,
because that is where a person expects to type. Handing over a target draws a
seam down the middle and splits the screen open along it, revealing the canvas
on the left and the command center on the right. The nav carries those two
destinations and nothing else: no inputs live in it.

## Running it

```
npm install
npm run dev
```

Then open `http://localhost:3000` and press Launch Damian.

```
npm run build      production build
npm run start      serve the production build
npm run typecheck  tsc, no emit
```

## What is real and what is simulated

There is no backend, no API routes and no server actions. The browsing is
simulated: a scripted timeline in `lib/mock-data.ts` played back on real timers
by `lib/use-damian.ts`, so the interface handles streaming arrival, out of order
reads and mid run interaction exactly as it would against a live Chromium
session. Credentials are held in memory for the session and never leave the
browser.

The capture is not a fetched image. `components/canvas/CapturedSurface.tsx`
draws a simulated target application from the design tokens, sized entirely in
percentages of a fixed aspect container. That is what lets the pin popover
reuse the same component at 3x as a genuine zoomed crop of the pinned region
rather than a second, faked one.

## Design system

Five core tokens and three status tokens, and nothing else.

| Role | Token | Hex |
| - | - | - |
| Background | Deep Void | `#08090C` |
| Surface | Obsidian Elevate | `#12141A`, hairline `#232733` |
| Text primary | Crisp Chalk | `#F3F4F6` |
| Text muted | Muted Silver | `#8E95A5` |
| Accent | Electric Cobalt | `#6366F1` |

Status tokens carry semantic state only, never decoration: Crimson `#EF4444`
for friction, Amber `#F59E0B` for copy and UX warnings, Emerald `#10B981` for
wins and opportunities.

Two constraints are enforced by `tailwind.config.ts` rather than by review. The
`colors` and `borderRadius` scales are replaced instead of extended, so a hex
outside the token set will not compile as a utility, and `rounded-none`,
`rounded-sm` and `rounded-md` do not exist.

Type is Space Grotesk for display and Plus Jakarta Sans for body and numeric
data, loaded through `next/font/google`. Space Grotesk is the neutral geometric
grotesque the direction calls for, and it carries a one word headline at 9rem
without needing help.

The white pill is the only place chalk is used as a fill. It marks the single
primary action on any given screen, and cobalt stays semantic: focus, live
agent state, and the seam the workspace splits along.

## Motion ownership

The two animation systems are split by job, and where they sit near each other
they are separated by a DOM level so neither writes a property the other owns.

GSAP owns the landing entrance, the split transition in `Workspace.tsx`, the streaming
telemetry reveal in `DamianFeed`, the pin drop sequence in `PinOverlay`, and the
radial stroke dash offset and numeral count in `Scorecard`.

Framer Motion owns the shared layout tab indicator in `TabBar`, the panel
exchange in `CommandCenter`, the pin popover enter and exit, the card hover
lift in `IdeaCard`, the modal enter and exit, and the toast stack.

At the pin, the anchor element is GSAP's, the counter scale against canvas zoom
is an inline style, and the badge hover is Tailwind. Three writers, three
elements, no contention.

`prefers-reduced-motion` collapses both systems to instant state changes, plus a
CSS layer in `globals.css` that stops the decorative loops. All three halves
read the same media query through `lib/use-media-query.ts`.

## Scope

Built: landing page, site nav, launch composer, the seam split transition,
session strip, split screen workspace, canvas with browser chrome and the pin
system, three command center tabs, credentials modal, and the mock data driving
all of it.

Deliberately not built in this pass: canvas pan and freeform zoom, screenshot
export to file, and viewport switching that reflows the capture. The viewport
control changes the frame width without reflowing the composition, which is the
honest version of that feature at this stage.
