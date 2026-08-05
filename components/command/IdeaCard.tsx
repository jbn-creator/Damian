'use client';

import { motion } from 'framer-motion';
import { Clock, GitPullRequestArrow } from 'lucide-react';
import { CATEGORY_LABEL } from '@/lib/mock-data';
import { copyToClipboard } from '@/lib/clipboard';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import { useToast } from '@/components/ui/Toast';
import type { ProductIdea } from '@/lib/types';

interface IdeaCardProps {
  idea: ProductIdea;
  targetUrl: string;
}

/**
 * Impact reads through the existing status tokens. High is a win, so emerald.
 * Medium is a caution, so amber. Low gets muted silver rather than crimson,
 * because a low impact opportunity is not a friction point and the palette is
 * not allowed to lie about that.
 */
const IMPACT_STYLE: Record<ProductIdea['impact'], string> = {
  High: 'border-emerald/40 bg-emerald/10 text-emerald',
  Medium: 'border-amber/40 bg-amber/10 text-amber',
  Low: 'border-hairline bg-void text-silver',
};

const IMPACT_DOT: Record<ProductIdea['impact'], string> = {
  High: 'bg-emerald',
  Medium: 'bg-amber',
  Low: 'bg-silver',
};

function buildIssueMarkdown(idea: ProductIdea, targetUrl: string): string {
  const sketch = idea.codeSnippet
    ? `\n#### Implementation sketch\n\n\`\`\`ts\n${idea.codeSnippet}\n\`\`\`\n`
    : '';

  return `### ${idea.title}

| Field | Value |
| - | - |
| Category | ${CATEGORY_LABEL[idea.category]} |
| Expected impact | ${idea.impact} |
| Effort | ${idea.effort} |
| Target | ${targetUrl} |
| Found by | Damian / Visual Product Intelligence Agent |

#### Problem

${idea.description}

#### Proposed solution

${idea.solution}
${sketch}`;
}

/**
 * One opportunity.
 *
 * Framer Motion writes the hover transform. The border and surface shifts are
 * plain CSS on the same hover, so the two systems split the card cleanly by
 * property rather than by element.
 */
export function IdeaCard({ idea, targetUrl }: IdeaCardProps) {
  const reduced = usePrefersReducedMotion();
  const { push } = useToast();

  const handleExport = async () => {
    const copied = await copyToClipboard(buildIssueMarkdown(idea, targetUrl));
    push(
      copied
        ? {
            tone: 'success',
            title: 'Issue markdown copied.',
            detail: idea.title,
          }
        : {
            tone: 'warning',
            title: 'Damian could not reach the clipboard.',
            detail: 'Your browser refused the write. Copy the text manually.',
          },
    );
  };

  return (
    <motion.article
      whileHover={reduced ? undefined : { y: -3 }}
      transition={reduced ? { duration: 0 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className="group rounded-3xl border border-hairline bg-obsidian p-4 transition-colors duration-300 ease-instrument hover:border-silver/35 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-hairline px-2.5 py-1 text-micro font-bold uppercase text-silver">
          {CATEGORY_LABEL[idea.category]}
        </span>

        <span
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro font-bold uppercase ${IMPACT_STYLE[idea.impact]}`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${IMPACT_DOT[idea.impact]}`} />
          {`${idea.impact} impact`}
        </span>

        <span className="ml-auto flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-micro font-bold uppercase text-silver">
          <Clock aria-hidden="true" className="h-2.5 w-2.5" strokeWidth={2.4} />
          <span data-numeric>{idea.effort}</span>
        </span>
      </div>

      <h4 className="mt-3.5 font-display text-[1.0625rem] font-bold leading-snug tracking-cut text-chalk">
        {idea.title}
      </h4>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <p className="text-micro font-semibold uppercase text-silver">Problem</p>
          <p className="mt-1.5 text-tiny leading-[1.65] text-silver">{idea.description}</p>
        </div>

        <div>
          <p className="text-micro font-semibold uppercase text-silver">Damian proposes</p>
          <p className="mt-1.5 text-tiny leading-[1.65] text-chalk">{idea.solution}</p>
        </div>
      </div>

      {idea.codeSnippet ? (
        <details className="mt-3.5 rounded-2xl border border-hairline bg-void">
          <summary className="cursor-pointer rounded-2xl px-3.5 py-2.5 text-micro font-semibold uppercase text-silver transition-colors duration-200 ease-instrument hover:text-chalk">
            Implementation sketch
          </summary>
          <pre className="overflow-x-auto border-t border-hairline px-3.5 py-3 font-mono text-[0.6875rem] leading-5 text-silver">
            <code>{idea.codeSnippet}</code>
          </pre>
        </details>
      ) : null}

      <button
        type="button"
        onClick={handleExport}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-hairline px-4 py-2.5 text-tiny font-semibold text-silver transition-colors duration-200 ease-instrument hover:border-cobalt/50 hover:text-chalk"
      >
        <GitPullRequestArrow aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
        Export to Issue
      </button>
    </motion.article>
  );
}
