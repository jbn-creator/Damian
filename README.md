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
from behind one.

Given test credentials, Damian finds the sign in, fills it and submits it before
the walk begins, so everything after that happens as a signed in visitor. That
matters because the half of most products worth looking at is the half behind
the door. Whether it worked is measured rather than assumed: a password box
still on screen means it did not, and a failed sign in is said out loud rather
than quietly walked past. The credentials are typed into the target's own form
as CDP input parameters, so they are never written into an injected script,
never appear in page source, are never sent to the model, and are held only for
the length of that one request.

### What Damian says

Two layers, and the second is optional.

`lib/findings.ts` is arithmetic on measured DOM values, so it costs nothing and
invents nothing. Every rule carries a weight: what a visitor would feel gets
spoken over the page, and design system hygiene only reaches the board.

`lib/judge.ts` is judgement. Set `GLM_API_KEY` and each captured screen goes to
a vision model along with every measurement already taken, and the model
decides what is worth saying: whether the theme coheres, whether the page reads
as generated, whether the primary action is actually clear, where structure
rather than styling is the problem. Nothing in the brief enumerates findings for
it, because a list of findings to look for is the rule engine again. The
measurements are passed in as the only figures it may quote, so a number in a
note is still a number somebody measured. Without a key, or if the call fails,
the rules answer instead.

It talks to any OpenAI shaped chat endpoint and defaults to Z.ai's `glm-5v-turbo`.
The model has to be one that takes images. `glm-5.2` is the stronger reasoner
but is text only, so it would be judging a description of the page rather than
the page, and every question above is a question about what the page looks like.

Boxes are not left to the model's eye. Every rectangle the DOM pass measured is
offered to it by name, and when a note is about one of them the measured
rectangle is used verbatim, so the note frames the element rather than its
neighbourhood. Estimating a box is the fallback for things the DOM pass never
measured.

The board is a second, separate question, asked once after the walk with every
page in view: what should this product build, cut, or charge for. It is aimed at
one person building something on their own time who needs users to come back, so
it will tell you to drop a feature that duplicates a tool people already trust
and spend the evening on the thing that would bring them back instead. A single
page cannot answer that, which is why it is not part of the per page pass.

The endpoint has a JSON mode but no schema enforcement, so the reply shape is a
request rather than a guarantee. Every field is validated on arrival and a
finding missing a box or a line, or an idea missing its problem or its solution,
is dropped rather than rendered half formed. That is what `lib/judge.test.ts`
covers: `node lib/judge.test.ts`.

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
