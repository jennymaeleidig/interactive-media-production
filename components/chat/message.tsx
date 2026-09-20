'use client';

// The block renderer: one adapter per block type, dispatched by `type`, inside
// one bubble per speaker-run.
//
// This table is the seam ticket 01 settled. Adding a block type is one entry
// here and touches nothing else — not the transcript, not the engine, not the
// dialogue format. `BLOCK_ADAPTERS` is exported so the seam can inject a
// throwing adapter and prove containment: a throwing adapter degrades to the
// designed fallback and cannot cost the transcript.
//
// Adapted from vercel/chatbot's part switch (Apache-2.0); see ../NOTICE.md.
//
// The `frame` and `image` adapters check their `src` against the inventory's
// derived allowlist (`pipeline/chat-blocks.mjs`) and issue no request for a
// source no human authored. The allowlist is computed once from the declaration,
// which is frozen at build time. The shipped inventory is empty, so neither
// adapter can render anything yet; both stay as capability.
//
// SPDX-License-Identifier: CC0-1.0
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Mark } from '@/components/brand/mark';
import { allowedSources } from '@/pipeline/chat-blocks.mjs';
import { cn } from '@/lib/utils';
import { ExternalLinkIcon } from './icons';
import type { ChatBlock } from '@/pipeline/chat-turn.mjs';
import type { ChatMessage as ChatMessageType } from '@/lib/types';

/** The authored remote sources, frozen once from the inventory. */
const ALLOWED_SOURCES = allowedSources();

/** Text never breaks out of the bubble, whatever the author pasted. */
const prose = 'whitespace-pre-wrap break-words';

function BlockedAtTheSeam() {
  return <p className={cn(prose, 'italic')}>Blocked at the seam. Not an authored source, so nothing was requested.</p>;
}

/** The designed fallback for a block type with no adapter, or a failed one. */
export function UnknownBlock({ reason }: { reason: string }) {
  return (
    <p className={cn(prose, 'rounded-chip border border-edge px-3 py-2 text-muted-foreground italic')}>
      This message could not be shown. {reason}
    </p>
  );
}

type AdapterProps = { block: ChatBlock };

function TextPart({ block }: AdapterProps) {
  return <p className={prose}>{(block as Extract<ChatBlock, { type: 'text' }>).text}</p>;
}

/** The viewer's own turn: the bubble already carries it, so the part is empty. */
function MePart() {
  return null;
}

function LinkPart({ block }: AdapterProps) {
  const { href, label } = block as Extract<ChatBlock, { type: 'link' }>;
  return (
    <a
      className="inline-flex w-fit items-center gap-1 text-content underline underline-offset-2 hover:opacity-90"
      href={href}
      rel="noreferrer noopener"
      target="_blank"
    >
      {label}
      <ExternalLinkIcon />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function ImagePart({ block }: AdapterProps) {
  const { src, alt, caption } = block as Extract<ChatBlock, { type: 'image' }>;
  if (!ALLOWED_SOURCES.has(src)) return <BlockedAtTheSeam />;
  return (
    <figure className="overflow-hidden rounded-chip">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={alt} className="h-auto w-full" src={src} />
      {caption ? <figcaption className="font-chrome pt-2 text-xs text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}

function FramePart({ block }: AdapterProps) {
  const { src, sandbox, title, caption } = block as Extract<ChatBlock, { type: 'frame' }>;
  if (!ALLOWED_SOURCES.has(src)) return <BlockedAtTheSeam />;
  return (
    <figure className="w-full overflow-hidden rounded-chip">
      <iframe className="h-[220px] w-full" sandbox={sandbox} src={src} title={title} />
      {caption ? <figcaption className="font-chrome pt-2 text-xs text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}

function UnknownPart({ block }: AdapterProps) {
  return <UnknownBlock reason={(block as Extract<ChatBlock, { type: 'unknown' }>).reason} />;
}

/** The adapter table. One entry per block type; unknown types fall through. */
export const BLOCK_ADAPTERS: Record<ChatBlock['type'] | 'failed', (props: AdapterProps) => ReactNode> = {
  text: TextPart,
  me: MePart,
  link: LinkPart,
  image: ImagePart,
  frame: FramePart,
  unknown: UnknownPart,
  failed: () => <UnknownBlock reason="Its renderer failed." />,
};

/** Render one block through its adapter, containing any throw. */
export function BlockPart({ block }: AdapterProps) {
  const adapter = BLOCK_ADAPTERS[block.type] ?? BLOCK_ADAPTERS.unknown;
  try {
    return <>{adapter({ block })}</>;
  } catch {
    return BLOCK_ADAPTERS.failed({ block });
  }
}

/** The assistant's mark on its disc, set beside the first bubble of a run —
 * the reference widget's own placement. Decorative: the bubble is the message. */
function AssistantMark() {
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-content text-grey-1"
      data-testid="assistant-mark"
    >
      <Mark className="h-4 w-auto" />
    </span>
  );
}

/** One speaker-run: the parts, in order, inside one bubble. */
export function Message({
  message,
  className,
  grouping = {},
}: {
  message: ChatMessageType;
  className?: string;
  /** Whether a same-speaker bubble sits above or below, so the shared corners square off. */
  grouping?: { continues?: boolean; continued?: boolean };
}) {
  const user = message.role === 'user';
  const reduceMotion = useReducedMotion();
  return (
    <div className={cn('flex w-full gap-2', user ? 'justify-end' : 'justify-start', className)}>
      {user ? null : (
        // A continued bubble holds the column open with nothing in it, so a run's
        // bubbles stay aligned under the one mark.
        <div aria-hidden="true" className="w-7 shrink-0">
          {grouping.continues ? null : <AssistantMark />}
        </div>
      )}
      <div
        className={cn(
          'flex max-w-[85%] flex-col gap-2 rounded-card px-4 py-2.5 text-base leading-relaxed text-bubble-content',
          user ? 'bg-bubble-me' : 'bg-bubble-bot',
          grouping.continues && (user ? 'rounded-tr-none' : 'rounded-tl-none'),
          grouping.continued && (user ? 'rounded-br-none' : 'rounded-bl-none'),
        )}
        data-role={message.role}
        data-testid={`message-${message.role}`}
      >
        {message.parts.map((part, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            key={`${message.id}-${index}`}
            transition={reduceMotion ? { duration: 0 } : { delay: index * 0.04, duration: 0.18, ease: [0.2, 0.7, 0.3, 1] }}
          >
            <BlockPart block={part} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
