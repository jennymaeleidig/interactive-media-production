'use client';

// The block renderer: one adapter per block type, dispatched by `type`, inside
// one bubble per speaker-run.
//
// This table is the seam. Adding a block type is one entry
// here and touches nothing else — not the transcript, not the engine, not the
// dialogue format. `BLOCK_ADAPTERS` is exported so the seam can inject a
// throwing adapter and prove containment: a throwing adapter degrades to the
// designed fallback and cannot cost the transcript.
//
// Adapted from vercel/chatbot's part switch (Apache-2.0); see ../NOTICE.md.
//
// The `frame` and `image` adapters check their `src` against the inventory's
// derived allowlist (`lib/chat-blocks.mjs`) and issue no request for a
// source no human authored. The allowlist is computed once from the declaration,
// which is frozen at build time. The shipped inventory is empty, so neither
// adapter can render anything yet; both stay as capability.
//
// SPDX-License-Identifier: CC0-1.0
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { memo, useRef, useState } from 'react';
// Citation: Tameem Safi — typewriter-effect (v2.22.0) [MIT]
// Source: https://github.com/tameemsafi/typewriterjs
import Typewriter, { type Options } from 'typewriter-effect';
import { allowedSources } from '@/lib/chat-blocks.mjs';
import { characterFor, type Character } from '@/lib/chat-characters.mjs';
import { splitIntoSteps } from '@/lib/pacing';
import { revealRuns, type RevealRun } from '@/lib/turn-plan';
import { cn } from '@/lib/utils';
import { speakLine, stopVoice } from '@/lib/voice';
import { ExternalLinkIcon } from './icons';
import type { ChatBlock } from '@/lib/chat-turn.mjs';
import type { ChatMessage as ChatMessageType } from '@/lib/transcript';

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

/** The reveal's step-size handle: a mutable box `BlockPart` owns so the hookless
 * adapters can read the current step while the typewriter's splitter runs. */
type StepRef = { current: number };

type AdapterProps = { block: ChatBlock; animate?: boolean; charsPerStep: StepRef };

/** What a caller gives `BlockPart`: it owns the step handle itself. */
type BlockProps = { block: ChatBlock; animate?: boolean };

/** The typewriter, in a component of its own because its options have to keep a
 * single identity for the life of the line.
 *
 * `typewriter-effect` deep-compares the options it is handed and, when they
 * differ, builds a fresh instance: the constructor blanks the wrapper's markup
 * and the update path never calls `onInit`, so the line is erased and nothing
 * ever types it again. A new options object each render — which is what an inline
 * object literal is — therefore wipes a line the moment its bubble re-renders,
 * and a bubble re-renders as soon as a later bubble joins its run.
 *
 * Building the object once closes that hole structurally rather than by
 * convention: nothing added to it later can make its identity drift, because
 * there is only ever one. It is held in a ref rather than a `useMemo`, because a
 * memo is only a hint — React is allowed to discard a cached value, which is
 * precisely the drift this exists to prevent — while a ref is stable for the life
 * of the component. The splitter reads the step handle when it runs, so it does
 * not need rebuilding either. The props are mount-only by design — a landed part
 * is keyed by its index and never changes. */
const Reveal = function Reveal({
  text,
  speaker,
  runs,
  charsPerStep,
}: {
  text: string;
  speaker: string;
  runs: RevealRun[];
  charsPerStep: StepRef;
}) {
  const cache = useRef<Partial<Options> | null>(null);
  if (cache.current === null) {
    cache.current = {
      cursor: '',
      delay: runs[0]?.delayMs,
      skipAddStyles: true,
      stringSplitter: (value: string) => splitIntoSteps(value, charsPerStep.current),
    };
  }
  const options = cache.current;
  return (
    <Typewriter
      component="span"
      onInit={(writer) => {
        const token = speakLine(text, speaker);
        runs.forEach((run, index) => {
          charsPerStep.current = run.charsPerStep;
          // The first run's delay is the wrapper's own; a later run changes it
          // before its text is queued, so each stretch types at its own pace.
          if (index > 0) writer.changeDelay(run.delayMs);
          writer.typeString(run.text);
        });
        // The typing is the turn's clock, and this is the one place that knows
        // when it actually ends: the voice is stopped on the completion event,
        // by token, so a slower voice is never cut before the line it belongs to
        // has finished — and a late completion cannot silence the line that
        // replaced it.
        writer.callFunction(() => stopVoice(token));
        writer.start();
      }}
      options={options}
    />
  );
};

function TextPart({ block, animate = false, charsPerStep }: AdapterProps) {
  const typed = block as Extract<ChatBlock, { type: 'text' }>;
  // The viewer's own line is never composed for them: it lands as log, whole.
  // Only a fresh message types itself out — a restored transcript (the opening
  // turn, a resume, a remount) renders whole, so the reveal never replays.
  if (typed.who !== 'bot' || !animate) return <p className={prose}>{typed.text}</p>;
  // The line types itself out in runs: the engine split it at every authored
  // `[pace=...]` boundary, and each run reads its speaker's own pace scaled by its
  // preset (`lib/turn-plan.ts`). Cursorless — the reveal is the arrival, so no
  // cursor is left blinking behind it. Motion is the piece (`CODING_STANDARDS.md`).
  // The voice (`lib/voice`) starts with the reveal, in the speaker's own pitch;
  // the typing is the clock, so the voice is stopped when the line has finished
  // typing, never the reverse.
  //
  // The bubble grows with the line as it arrives. Its height is the text's own,
  // so the pop-in (a transform) and the growth (layout) stay independent: the
  // reveal never fights the arrival animation, and the transcript below it
  // follows on `StickToBottom`'s own smooth resize.
  return (
    <p className={prose}>
      <Reveal charsPerStep={charsPerStep} runs={revealRuns(typed)} speaker={typed.speaker} text={typed.text} />
    </p>
  );
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
export function BlockPart({ block, animate }: BlockProps) {
  // The adapters are invoked as plain functions so a throw is contained here and
  // degrades to the designed fallback — and that means none of them may hold a
  // hook. The reveal's step handle lives here for that reason and is passed down;
  // `TextPart` sets it as it queues each run. The reveal rides one queue entry
  // per frame, so a `fast` run packs several characters into each entry rather
  // than asking for an unreachably short delay.
  const charsPerStep = useRef(1);
  const adapter = BLOCK_ADAPTERS[block.type] ?? BLOCK_ADAPTERS.unknown;
  const props = { block, animate, charsPerStep };
  try {
    return <>{adapter(props)}</>;
  } catch {
    return BLOCK_ADAPTERS.failed(props);
  }
}

/** One character's mark on its disc: the reference widget's own placement, moved
 * to the bubble's bottom-left corner — or, hung the same way at the same offset,
 * just off the typing indicator's corner. There is no separate composing mark: the
 * indicator borrows this one outright, so the mark's footprint is identical before
 * and after a message lands. The image is a local, self-hosted asset
 * (`lib/chat-characters.mjs`), so the page requests no third party; its alt is
 * the character's display name, so the mark names its speaker to assistive tech. */
export function CharacterMark({ character }: { character: Character }) {
  return (
    <span
      className="bg-content flex size-7 shrink-0 items-center justify-center rounded-full"
      data-testid={`character-mark-${character.id}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={character.mark.alt} className="h-4 w-auto" src={character.mark.src} />
    </span>
  );
}

/** The dev-only load timer: how long this one message took — its own composing
 * weight plus the turn's engine time, never cumulative across the turn — rendered as
 * a small chrome tag under the bubble's trailing corner. It rides in the
 * message's own column, in flow, so a message that lands after it can never
 * cover it; it exists only when the dev server serves the page
 * (`NODE_ENV=development`, inlined by Next into the client bundle), so a
 * built page carries neither the tag nor its line. */
export function LoadTimer({ message }: { message: ChatMessageType }) {
  const [debug] = useState(() => process.env.NODE_ENV === 'development');
  // The viewer's own turns land instantly by construction — the timer only
  // says anything about the assistant's composing, so user bubbles carry none.
  if (!debug || message.role === 'user' || message.timing === undefined) return null;
  return (
    <span
      className="font-chrome self-end pt-0.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
      data-testid="load-timer"
      title={`composing ${message.timing.composingMs}ms · elapsed ${message.timing.elapsedMs}ms`}
    >
      {message.timing.elapsedMs}ms
    </span>
  );
}

/** One speaker-run: the parts, in order, inside one bubble.
 *
 * Memoized, so a turn that appends costs the new bubble alone: the dialogue
 * hook's ledger hands back the same message object for every run the
 * transcript already holds, and the grouping props are value-comparable
 * primitives — booleans and a string, never a fresh object per render — so
 * the shallow compare bails the bubble out and React touches neither its
 * fiber nor its DOM element. A bubble is remounted only if its key changes,
 * and keys are log positions (`groupBlocks`), stable across turns, resumes,
 * and grouping rework. */
export const Message = memo(function Message({
  message,
  className,
  continues = false,
  continued = false,
}: {
  message: ChatMessageType;
  className?: string;
  /** Whether a same-speaker bubble sits above or below, so the shared corners
   * square off. Primitives, deliberately: the memo bails on them by value. */
  continues?: boolean;
  continued?: boolean;
}) {
  const user = message.role === 'user';
  // The arrival: a bubble pops into place the way a message lands in a thread —
  // a short spring from its own bottom corner, so it grows out of the edge it
  // shares with the mark, rather than fading in from nowhere. Only a fresh
  // turn's bubbles animate; a restored transcript renders at rest
  // (`CODING_STANDARDS.md`: motion is scoped to arrival). The exit is the same
  // shape backwards, for a bubble that leaves when the conversation resets.
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={cn('flex w-full gap-2', user ? 'justify-end' : 'justify-start', className)}
      exit={{ opacity: 0, scale: 0.96, y: 6 }}
      initial={message.fresh === true ? { opacity: 0, scale: 0.86, y: 12 } : false}
      style={{ transformOrigin: user ? 'bottom right' : 'bottom left' }}
      transition={{
        type: 'spring',
        stiffness: 420,
        damping: 30,
        mass: 0.9,
        opacity: { duration: 0.2, ease: 'easeOut' },
      }}
    >
      {user ? null : (
        // A bubble continues a run by holding this column open with nothing in
        // it, so every bubble starts at the same x. The mark itself is drawn on
        // the bubble (below), where its own box anchors it.
        <div aria-hidden="true" className="w-7 shrink-0" />
      )}
      {/* The bubble and its dev timer share a column: the tag holds its own
          line under the bubble's trailing corner, so a message that lands
          above it can never cover it. */}
      <div className={cn('flex min-w-0 max-w-[85%] flex-col', user ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'font-serif relative flex flex-col gap-2 rounded-card px-4 py-2.5 text-base leading-relaxed text-bubble-content',
            user ? 'bg-bubble-me' : 'bg-bubble-bot',
            continues && (user ? 'rounded-tr-none' : 'rounded-tl-none'),
            continued && (user ? 'rounded-br-none' : 'rounded-bl-none'),
          )}
          data-message-id={message.id}
          data-role={message.role}
          data-testid={`message-${message.role}`}
        >
          {message.parts.map((part, index) => (
            <BlockPart animate={message.fresh === true} block={part} key={`${message.id}-${index}`} />
          ))}
          {user || continued ? null : (
            // The mark hangs on the bubble's own box rather than in the column
            // above it, so it sits at the bubble's bottom-left corner — level
            // with the composing bubble's mark, which the run's last bubble
            // meets — and the dev timer below the bubble cannot drag it down.
            // `-left-9` is the reserved column plus its gap, so the disc lands
            // exactly in the column with its usual 8px clear of the bubble's
            // edge; anchoring the run's *last* bubble puts the mark at the foot
            // of the run, where the next speaker's turn begins.
            <span className="absolute -bottom-2 -left-9">
              <CharacterMark character={characterFor(message.speaker)} />
            </span>
          )}
        </div>
        <LoadTimer message={message} />
      </div>
    </motion.div>
  );
});
