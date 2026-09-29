// @vitest-environment jsdom
//
// The turn seam: how a held turn actually advances. `lib/turn-plan.ts` is pure
// and pinned on its own; this mounts the dialogue hook against an injected
// engine and fires each reveal's end by hand, because the load-bearing decision
// is that the turn advances on that event rather than on a duration.
//
// Pinned here: a reply lands one message at a time; the next land is held until
// the previous reveal reports its end, not until a duration elapses; a mute land
// waits its content-weight hold; and a restart abandons an in-flight reveal
// rather than landing it into the new conversation.
//
// SPDX-License-Identifier: CC0-1.0
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDialogue } from '@/hooks/use-dialogue';
import { composingDelay } from '@/lib/turn-plan';
import { muteRevealHoldMs } from '@/lib/reveal';
import { COMPOSING_EXIT_MS, COMPOSING_LEAD_MS, FRAME_MS } from '@/lib/pacing';
import type { ChatBlock, ChatResponse } from '@/lib/chat-turn.mjs';

const greeting: ChatBlock = { who: 'bot', speaker: 'cam', type: 'text', text: 'Hello' };
const echo: ChatBlock = { who: 'me', type: 'text', text: 'Support' };
const reply1: ChatBlock = { who: 'bot', speaker: 'cam', type: 'text', text: 'First reply' };
const reply2: ChatBlock = { who: 'bot', speaker: 'cam', type: 'text', text: 'Second reply', newMessage: true };
const muteLink: ChatBlock = { who: 'bot', speaker: 'cam', type: 'link', href: 'https://example.test/', label: 'Open the docs' };
const after: ChatBlock = { who: 'bot', speaker: 'cam', type: 'text', text: 'After the link', newMessage: true };

const EXIT = COMPOSING_EXIT_MS + FRAME_MS;

const response = (blocks: ChatBlock[], complete = false): ChatResponse => ({
  turn: { blocks, options: complete ? [] : [{ index: 0, text: 'Support' }] },
  state: { node: null, complete, vars: {} },
});

const START = response([greeting]);
/** A reply authored as two bubbles: two lands, the second only after the first types. */
const TWO_BUBBLES = response([greeting, echo, reply1, reply2], true);
/** A reply whose first learn has nothing to type, then a typed bubble. */
const MUTE_THEN_TEXT = response([greeting, echo, muteLink, after], true);

/** Advance fake time and let the hook's async chain, and React, settle. */
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('the turn seam', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as { __flockChatEngine: unknown }).__flockChatEngine = {
      turn: vi.fn((request: { type: string }) => Promise.resolve(request.type === 'start' ? START : TWO_BUBBLES)),
      reset: vi.fn(() => Promise.resolve(START)),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('lands one message at a time and holds the next until the reveal ends', async () => {
    const { result } = renderHook(() => useDialogue());
    await advance(0);
    expect(result.current.messages.map((message) => message.parts[0])).toEqual([greeting]);

    // The viewer chooses: the echo lands at once, the reply holds.
    act(() => result.current.sendOption({ index: 0, text: 'Support' }));
    await advance(0);
    expect(result.current.messages).toHaveLength(2);

    // The lead, the first beat, and the dots' exit carry the first reply in.
    await advance(COMPOSING_LEAD_MS + composingDelay([reply1]) + EXIT);
    expect(result.current.messages.map((message) => message.parts[0])).toEqual([greeting, echo, reply1]);
    expect(result.current.busy).toBe(true);

    // The second bubble must not land on a duration, however long: it waits for
    // the first reveal's end.
    await advance(600_000);
    expect(result.current.messages).toHaveLength(3);

    // Firing that end lets the next land.
    act(() => result.current.onRevealEnd(result.current.messages.at(-1)!.id));
    await advance(composingDelay([reply2]) + EXIT);
    expect(result.current.messages.map((message) => message.parts[0])).toEqual([greeting, echo, reply1, reply2]);
    expect(result.current.busy).toBe(true);

    act(() => result.current.onRevealEnd(result.current.messages.at(-1)!.id));
    await advance(0);
    expect(result.current.busy).toBe(false);
  });

  it('waits a mute land out for its content weight, then lands the next bubble', async () => {
    (window as unknown as { __flockChatEngine: { turn: unknown } }).__flockChatEngine.turn = vi.fn((request: { type: string }) =>
      Promise.resolve(request.type === 'start' ? START : MUTE_THEN_TEXT),
    );
    const { result } = renderHook(() => useDialogue());
    await advance(0);

    act(() => result.current.sendOption({ index: 0, text: 'Support' }));
    // Carry the mute link in: lead, its beat, then the dots' exit.
    await advance(COMPOSING_LEAD_MS + composingDelay([muteLink]) + EXIT);
    expect(result.current.messages.map((message) => message.parts[0])).toEqual([greeting, echo, muteLink]);

    const hold = muteRevealHoldMs([muteLink]);
    expect(hold).toBeGreaterThan(0);
    // Nothing types, so no reveal end will come; the step is waited out for the
    // link's own content weight rather than landing instantly.
    await advance(Math.floor(hold / 2));
    expect(result.current.messages).toHaveLength(3);

    await advance(Math.ceil(hold / 2) + composingDelay([after]) + EXIT);
    expect(result.current.messages.map((message) => message.parts[0])).toEqual([greeting, echo, muteLink, after]);
  });

  it('abandons an in-flight reveal on restart and never lands it', async () => {
    const { result } = renderHook(() => useDialogue());
    await advance(0);
    act(() => result.current.sendOption({ index: 0, text: 'Support' }));
    await advance(COMPOSING_LEAD_MS + composingDelay([reply1]) + EXIT);
    expect(result.current.messages).toHaveLength(3);

    const abandonedId = result.current.messages.at(-1)!.id;
    // Start over while the first reply is still typing. The fresh conversation
    // lands at once, and the old reveal's end cannot land into it.
    act(() => result.current.reset());
    await advance(0);
    expect(result.current.messages.map((message) => message.parts[0])).toEqual([greeting]);

    act(() => result.current.onRevealEnd(abandonedId));
    await advance(600_000);
    expect(result.current.messages.map((message) => message.parts[0])).toEqual([greeting]);
  });
});
