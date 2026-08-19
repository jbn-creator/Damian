# Decisions

Resolved arguments, with the losing side recorded. If one of these gets reopened,
the reason should be new evidence, not a fresh opinion.

---

### Live narration is primary; video is a byproduct

**Rejected:** video-first, live as a nice-to-have.

Live is more convincing — you are watching it browse, not watching a render — and
the reading-pace work is the most distinctive thing here. But live output cannot
leave the session, and the free-teardown growth loop had exactly one mechanic: a
stranger sees someone else's teardown.

These were never actually in tension. Screencast frames already stream; notes are
already timed. Build capture before launch, expose it after signup exists.

---

### Both modes ship; tour is default until goal earns it

**Rejected:** goal-only. Also rejected: tour-only.

Goal is the better product. Behavioural evidence — "six steps then it gave up" —
is unarguable in a way an aesthetic judgement never is. But tour works today, works
on any site, always produces output, and goal mode's hard part (knowing when to give
up, and being right about it) is unbuilt.

Mode is chosen at input the way a model is chosen in a chat client: short label, one
line of explanation. Goal is promoted to default when it clears its hit rate.

---

### Goals are presets first, custom second, and always data

**Rejected:** a free-text goal box as the primary input.

The prompt is the product. A blank box outsources the core craft to someone with no
idea what makes a good goal — "check my website" produces mush. A fixed set can also
be evaluated per-goal, which free text cannot.

**Rejected:** presets only. "Start a trial" is meaningless on a portfolio or a blog,
and the highest-value run is the user's actual funnel, which only they know.

Resolution: Damian proposes three goals after seeing the homepage. The hard part was
never writing the goal — it was knowing which goal this site has.

And structurally: a goal fills one slot in the brief and is never concatenated onto
the system prompt. Injection becomes impossible rather than filtered.

---

### Raw CDP stays

**Rejected:** migrating to Playwright.

Playwright would hand over tracing, HAR capture, network interception and device
emulation for free, all of which the parked chaos-mode work wants. But 49s on
basecamp with zero browser dependencies is a real asset, and the current design owns
its own attack surface.

Revisit only if chaos mode makes device profiles and throttling genuinely painful.
Not on principle, and not before.

---

### Board over pull requests, until premium

**Rejected:** fix-as-PR as a core mechanic.

A GitHub App, repo read and DOM-to-source mapping is a quarter of work to automate
what is usually a two-line CSS change. And an agent exploring a repo to fix one
finding will blow the context window doing it.

The opportunity board already matches the stated audience: a solo builder's scarcest
resource is evenings, and "cut the CV generator" is worth more than a contrast fix.

Premium gets PRs in a bounded shape: one finding, one file fetched by path, a diff of
that file only. Scoped codegen, not an autonomous agent.

---

### Credentials on any site stays, gated

**Rejected:** ownership verification before any authenticated run.

Auditing the signed-in product is where the real UX lives and nobody else does it.
Killing it to satisfy a rule from a greenfield spec would remove the differentiated
value.

Kept with conditions: origin check on the password field, a consent line naming the
model provider before the field appears, and ownership verification required before
this is ever hosted. Locally, as it stands, it is fine.

---

### No queue, no Postgres, no monorepo

**Rejected:** the infrastructure from the original greenfield spec.

Redis, BullMQ, Drizzle and a package split solve problems this does not have — runs
surviving deploys, run-over-run diffs, multi-tenant history. Add persistence when
results become shareable, and start with blob storage and one table.

---

### Findings without a box degrade, they do not get dropped

**Reversed 2026-08-19.** The rule previously read "a finding with no box has nowhere
to point → drop it," written to stop `undefined` rendering over somebody's landing
page. Correct instinct, wrong blast radius.

Measured: `toNote` discarded one finding in four, deterministically — 4 returned / 3
usable, three times, across structurally different pages. The walk call kept 5 of 5
because `toIdea` validates text only. The loss was entirely rect resolution, not
malformed replies. Every dropped finding had something to say and nowhere to say it.

The part that decided it: nothing knew whether the discarded finding was the *best*
one. If the model leads with its most specific observation, and specificity
correlates with naming an unusual element, the validator was deleting the sharpest
thing it said, every run, invisibly.

Losing the pointer is a formatting problem. Losing the judgement is a product
problem. Findings with text but no box now become page-level notes.

---

### Silent fallback is a bug, not a feature

"Judgement is an upgrade, never a dependency" stays — the rule engine answering when
the model fails is correct and load-bearing.

What was wrong is that it happened invisibly. The fallback voice renders identically
to model output, so for 44 commits nobody could tell which brain had spoken. A
status report claimed the model had never run; it had. Answering the question
required adding logging first, because the repo held no evidence either way.

Now: every model call traces to console and `judge.log`, every drop is logged with a
cause, and provenance reaches the UI. Same principle as the bot-wall honesty rule,
turned on Damian itself.

---

### STATUS.md is not a source of truth

It exists nowhere in the repo or its history, so whatever generated it wrote outside
version control — and it was confidently wrong about the single most important fact
in the project.

CLAUDE.md, ROADMAP.md and DECISIONS.md are versioned and live at repo root. Any
generated status report is a snapshot, is stale on arrival, and loses to these three
files plus `judge.log`.
