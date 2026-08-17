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

The browsing is real. `app/api/capture/route.ts` drives a headless Chrome over
raw CDP from `lib/capture.ts`, with no automation dependency, and streams the
walk back as newline delimited JSON: live frames as they paint, then each page
as it finishes. Damian resolves links, moves a visible cursor, verifies the hit
test before pressing, scrolls, narrows to phone width, and measures the DOM.
`lib/use-damian.ts` reads that stream.

The scripted timeline in `lib/mock-data.ts` is the fallback, played back on real
timers when the host has no Chrome. The interface says so when that happens
rather than presenting it as a capture.

Bot walls are detected and named, never bypassed, and no finding is reported
from behind one. Credentials are held in memory for the session.

### What Damian says

Two layers, and the second is optional.

`lib/findings.ts` is arithmetic on measured DOM values, so it costs nothing and
invents nothing. Every rule carries a weight: what a visitor would feel gets
spoken over the page, and design system hygiene only reaches the board.

`lib/judge.ts` is judgement. Set `ANTHROPIC_API_KEY` and each captured screen
goes to a vision model along with every measurement already taken, and the
model decides what is worth saying: whether the theme coheres, whether the page
reads as generated, whether the primary action is actually clear, where
structure rather than styling is the problem. Nothing in the brief enumerates
findings for it, because a list of findings to look for is the rule engine
again. The measurements are passed in as the only figures it may quote, so a
number in a note is still a number somebody measured. Without a key, or if the
call fails, the rules answer instead.

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
