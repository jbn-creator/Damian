import type {
  AuditPin,
  ProductIdea,
  ScorecardMetric,
  ScriptedLog,
  ScriptedPinDrop,
  ScriptedStateChange,
} from './types';

/** The target Damian opens by default. */
export const DEFAULT_TARGET_URL = 'https://app.yourproduct.com';

/**
 * Pins are anchored in percentages so they hold their position against the
 * captured surface at any container size and at any zoom step.
 */
export const AUDIT_PINS: AuditPin[] = [
  {
    id: 'pin-friction-signup',
    x: 75,
    y: 44,
    type: 'friction',
    title: 'High friction signup form. 7 required fields.',
    description:
      'The above the fold capture asks for 7 required fields before it returns anything of value. Benchmark median for this category is 3. Every field past the third costs roughly 7 percent of completions, and 4 of these can be inferred or deferred: company size, role, phone, and team name.',
    impactScore: 92,
    suggestedFix:
      'Reduce to email and password. Move company size, role, phone and team name into a post activation profile step that Damian can prefill from the email domain.',
  },
  {
    id: 'pin-copy-headline',
    x: 20,
    y: 27,
    type: 'warning',
    title: 'Headline copy lacks a clear value proposition.',
    description:
      'The headline names the product and its category. It never names the outcome, the audience, or the proof. A first time visitor finishes reading it without knowing what changes for them if they sign up, so the form below inherits an unearned ask.',
    impactScore: 74,
    suggestedFix:
      'Lead with the outcome and put a number on it. State who it is for in the subhead, then move one proof point above the form so the ask arrives after the argument.',
  },
  {
    id: 'pin-win-hierarchy',
    x: 28,
    y: 78,
    type: 'opportunity',
    title: 'Clean visual hierarchy on the main dashboard.',
    description:
      'This grid is the strongest surface in the product. One primary metric holds the top left, secondary tiles step down in weight correctly, and the chart carries no decoration competing with the data. Scan order matches importance order.',
    impactScore: 68,
    suggestedFix:
      'Promote this pattern. Reuse the same weight ladder on the reporting and billing screens, both of which currently give every tile equal emphasis.',
  },
];

/**
 * Damian's scripted run. Timings are the pacing of a real session: fast at
 * paint, slower through analysis, decisive at the board.
 */
export const DAMIAN_SCRIPT: ScriptedLog[] = [
  {
    id: 'log-01',
    at: 100,
    timestamp: '0.1s',
    type: 'info',
    message: 'Navigated to landing page. Waiting for paint.',
  },
  {
    id: 'log-02',
    at: 400,
    timestamp: '0.4s',
    type: 'info',
    message: 'Detected high friction lead capture above the fold.',
  },
  {
    id: 'log-03',
    at: 1200,
    timestamp: '1.2s',
    type: 'insight',
    message: 'Analyzing visual hierarchy against 50k benchmarks.',
  },
  {
    id: 'log-04',
    at: 2600,
    timestamp: '2.6s',
    type: 'insight',
    message: 'Signup form requires 7 fields. Benchmark median is 3.',
  },
  {
    id: 'log-05',
    at: 3400,
    timestamp: '3.4s',
    type: 'action',
    message: 'Pinning friction point at hero section.',
  },
  {
    id: 'log-06',
    at: 4200,
    timestamp: '4.2s',
    type: 'insight',
    message: 'Headline names the category. It never names the outcome.',
  },
  {
    id: 'log-07',
    at: 4900,
    timestamp: '4.9s',
    type: 'action',
    message: 'Pinning copy warning at hero headline.',
  },
  {
    id: 'log-08',
    at: 5600,
    timestamp: '5.6s',
    type: 'info',
    message: 'Signed in with the test credentials. Session is live.',
  },
  {
    id: 'log-09',
    at: 6400,
    timestamp: '6.4s',
    type: 'action',
    message: 'Pinning a win at the dashboard grid. Hierarchy holds.',
  },
  {
    id: 'log-10',
    at: 7100,
    timestamp: '7.1s',
    type: 'insight',
    message: 'First run has no empty state. New accounts land on a blank table.',
  },
  {
    id: 'log-11',
    at: 7800,
    timestamp: '7.8s',
    type: 'insight',
    message: 'Export runs unmetered on the free tier. No offer attached.',
  },
  {
    id: 'log-12',
    at: 8400,
    timestamp: '8.4s',
    type: 'info',
    message: 'Scoring 4 dimensions against category benchmarks.',
  },
  {
    id: 'log-13',
    at: 9000,
    timestamp: '9.0s',
    type: 'action',
    message: 'Board ready. 9 opportunities. 3 pins on the canvas.',
  },
];

/** Damian places each pin at the moment he announces it. */
export const PIN_SCHEDULE: ScriptedPinDrop[] = [
  { pinId: 'pin-friction-signup', at: 3400 },
  { pinId: 'pin-copy-headline', at: 4900 },
  { pinId: 'pin-win-hierarchy', at: 6400 },
];

export const STATE_SCHEDULE: ScriptedStateChange[] = [
  { state: 'launching', at: 0 },
  { state: 'scanning', at: 320 },
  { state: 'analyzing', at: 2500 },
  { state: 'complete', at: 9200 },
];

/** Total run length, derived so the progress readout cannot drift. */
export const RUN_DURATION = STATE_SCHEDULE[STATE_SCHEDULE.length - 1].at;

/** Short label for Damian's current activity, shown in the launch control. */
export const STATE_ACTIVITY: Record<string, string> = {
  idle: 'Standing by',
  launching: 'Opening session',
  scanning: 'Reading the page',
  analyzing: 'Weighing the evidence',
  complete: 'Board ready',
};

export const PRODUCT_IDEAS: ProductIdea[] = [
  /* Quick wins. UX changes under two hours. */
  {
    id: 'idea-signup-fields',
    category: 'quick_win',
    title: 'Cut signup to email and password',
    description:
      'Signup asks for 7 required fields before the visitor has seen anything work. Company size, role, phone and team name are all inferable or deferrable, and each one is costing completions at the exact moment intent is highest.',
    solution:
      'Ship email and password only. Infer company from the email domain, and collect the remaining 4 fields inside the product once the account has something in it worth protecting.',
    impact: 'High',
    effort: '2h',
    codeSnippet: `const REQUIRED_AT_SIGNUP = ['email', 'password'] as const;

// Everything below moves into the post activation profile step.
const DEFERRED_TO_PROFILE = [
  'companySize',
  'role',
  'phone',
  'teamName',
] as const;`,
  },
  {
    id: 'idea-headline-outcome',
    category: 'quick_win',
    title: 'Put the outcome in the headline',
    description:
      'The current headline states what the product is. A visitor reaches the form without learning what changes for them, so the 7 field ask arrives with no argument behind it.',
    solution:
      'Lead with the measurable outcome, name the audience in the subhead, and lift one proof point above the form so the ask lands after the case is made.',
    impact: 'High',
    effort: '1h',
    codeSnippet: `<h1>Ship the review in 40 minutes, not 3 days.</h1>
<p>For product teams who own the roadmap and the outcome.</p>
<p data-proof>2,400 teams. 41 percent faster to first release.</p>`,
  },
  {
    id: 'idea-empty-state',
    category: 'quick_win',
    title: 'Give the first run an empty state',
    description:
      'A new account lands on an empty table with headers and nothing else. The product looks broken at the one moment it has to look capable, and there is no next action on screen.',
    solution:
      'Render a first run state with one sample row marked as an example, a single primary action, and a line naming what appears here once real data arrives.',
    impact: 'Medium',
    effort: '4h',
  },

  /* Missing features. Capabilities competitors ship that this product lacks. */
  {
    id: 'idea-saved-views',
    category: 'missing_feature',
    title: 'Saved views on the reporting table',
    description:
      'Every filter combination is rebuilt by hand on each visit. The three closest competitors all persist named views, and this is the most common reason teams keep a parallel spreadsheet.',
    solution:
      'Persist filter, sort and column state as a named view. Allow one default per user and sharing across the workspace.',
    impact: 'High',
    effort: '1w',
    codeSnippet: `interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string[]>;
  sort: { column: string; direction: 'asc' | 'desc' };
  columns: string[];
  scope: 'private' | 'workspace';
  isDefault: boolean;
}`,
  },
  {
    id: 'idea-slack-delivery',
    category: 'missing_feature',
    title: 'Slack delivery for alerts',
    description:
      'Alerts land in email only. Email is where operational signal goes to die, and the category standard has been Slack delivery for two years.',
    solution:
      'Add a Slack destination on the alert model with channel routing per alert, plus a digest option so high frequency alerts do not train people to mute the channel.',
    impact: 'Medium',
    effort: '3d',
  },
  {
    id: 'idea-bulk-actions',
    category: 'missing_feature',
    title: 'Bulk actions on the asset list',
    description:
      'Archiving 30 assets takes 30 round trips through a confirmation dialog. The list already has checkboxes, so the interface promises a capability the product does not deliver.',
    solution:
      'Wire the existing selection state to archive, tag and reassign. One confirmation for the batch, with undo held open for 10 seconds.',
    impact: 'Medium',
    effort: '2d',
  },

  /* Monetization hooks. Strategic upsell placement. */
  {
    id: 'idea-meter-export',
    category: 'monetization',
    title: 'Meter the export action',
    description:
      'Export is the highest intent action in the product and it runs unmetered on the free tier. The moment a user needs data out is the moment they have already proved the value, and nothing is asked of them.',
    solution:
      'Allow 3 exports per month on free. On the fourth, show the paid tier inline at the point of action with the row count already filled in, not a generic upgrade page.',
    impact: 'High',
    effort: '1d',
    codeSnippet: `const FREE_EXPORTS_PER_MONTH = 3;

function exportGate(used: number, rows: number) {
  if (used < FREE_EXPORTS_PER_MONTH) return { allow: true };
  return {
    allow: false,
    offer: {
      surface: 'inline_at_action',
      headline: \`Export all \${rows.toLocaleString()} rows\`,
      cta: 'Unlock unlimited exports',
    },
  };
}`,
  },
  {
    id: 'idea-seat-upgrade',
    category: 'monetization',
    title: 'Seat prompt at the invite step',
    description:
      'The invite flow silently caps at the plan limit and returns an error. A user trying to add a teammate is a user trying to spend money, and the product answers with a validation message.',
    solution:
      'When the invite exceeds the seat count, show the prorated cost for the additional seat inside the invite dialog and complete both actions in one confirmation.',
    impact: 'Medium',
    effort: '4h',
  },
  {
    id: 'idea-annual-toggle',
    category: 'monetization',
    title: 'Annual toggle on the pricing panel',
    description:
      'Only monthly pricing is shown in product. Annual billing exists on the marketing site, so the visitors closest to converting are the only ones who never see the cheaper commitment.',
    solution:
      'Add a monthly and annual toggle defaulting to annual, with the saved amount stated in currency rather than a percentage.',
    impact: 'Low',
    effort: '2h',
  },
];

export const SCORECARD_METRICS: ScorecardMetric[] = [
  {
    id: 'metric-hierarchy',
    label: 'Visual Hierarchy',
    score: 78,
    verdict: 'Structure reads. The dashboard grid does the heavy lifting.',
  },
  {
    id: 'metric-friction',
    label: 'UX Friction',
    score: 34,
    verdict: 'Signup is the bottleneck. 7 fields against a median of 3.',
  },
  {
    id: 'metric-copy',
    label: 'Copy Clarity',
    score: 46,
    verdict: 'The headline names the product, never the outcome.',
  },
  {
    id: 'metric-onboarding',
    label: 'Onboarding Efficiency',
    score: 52,
    verdict: 'No empty state. First run lands on a blank table.',
  },
];

/** Section copy for the opportunity board, in Damian's voice. */
export const IDEA_GROUPS = [
  {
    category: 'quick_win' as const,
    heading: 'Quick Wins',
    note: 'UX changes under two hours. Ship these this week.',
  },
  {
    category: 'missing_feature' as const,
    heading: 'Missing Features',
    note: 'Capabilities the category ships and this product does not.',
  },
  {
    category: 'monetization' as const,
    heading: 'Monetization Hooks',
    note: 'High intent moments currently asking for nothing.',
  },
];

export const CATEGORY_LABEL: Record<ProductIdea['category'], string> = {
  quick_win: 'Quick Win',
  missing_feature: 'Missing Feature',
  monetization: 'Monetization',
};

export const PIN_TYPE_LABEL: Record<AuditPin['type'], string> = {
  friction: 'Friction',
  warning: 'Copy and UX',
  opportunity: 'Opportunity',
};
