// The transcript rule, pinned without a DOM.
//
// `lib/transcript.ts` groups the engine's flat block log into one message per
// speaker-run and lays those messages out as rows: the divider above each, and
// the corner flags that pair a run's bubbles. These are the pure assertions the
// shell seam used to carry; it keeps one DOM representative each so the rule is
// still proven to reach the screen.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { groupBlocks, transcriptRows, TIME_GAP_MS, type ChatMessage } from '../lib/transcript';
import type { ChatBlock } from '../lib/chat-turn.mjs';

const cam = (text: string): ChatBlock => ({ who: 'bot', speaker: 'cam', type: 'text', text });
const cut = (text: string): ChatBlock => ({ who: 'bot', speaker: 'cam', type: 'text', text, newMessage: true });
const flock = (text: string): ChatBlock => ({ who: 'bot', speaker: 'flock', type: 'text', text });

const at = (day: number, hours: number, minutes: number): Date => new Date(2026, 0, day, hours, minutes);
const message = (id: string, role: ChatMessage['role'], when: Date): ChatMessage => ({
  id,
  role,
  parts: [],
  at: when,
});

describe('grouping blocks into messages', () => {
  it('keeps consecutive same-speaker text in one message', () => {
    const grouped = groupBlocks([cam('one'), cam('two')]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].parts).toHaveLength(2);
  });

  it('cuts a new message at a newMessage boundary', () => {
    const grouped = groupBlocks([cam('first'), cut('second')]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].parts).toHaveLength(1);
    expect(grouped[1].parts).toHaveLength(1);
  });

  it('cuts a new message when the speaker changes', () => {
    // Two characters' lines are two messages even inside one authored reply, so
    // each run carries its own mark: a Flock line then a Cam line is not one run.
    const grouped = groupBlocks([flock('one'), cam('two')]);
    expect(grouped).toHaveLength(2);
    expect(grouped.map((message) => message.speaker)).toEqual(['flock', 'cam']);
  });

  it('groups consecutive lines from one character, mark and all', () => {
    const grouped = groupBlocks([flock('one'), flock('two')]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].speaker).toBe('flock');
    expect(grouped[0].parts).toHaveLength(2);
  });

  it('derives each id from the log position of the run’s first block', () => {
    const log: ChatBlock[] = [cam('one'), cam('two'), cam('three')];
    expect(groupBlocks(log).map((m) => m.id)).toEqual(['run-0']);

    // A grouping rework cuts the run in two: the surviving run keeps its id —
    // it is the position in the log, not the place in the render order — and
    // the new run takes the log position of its own first block.
    const reworked = groupBlocks(log.map((block, index) => (index === 2 ? { ...block, newMessage: true } : block)));
    expect(reworked.map((m) => m.id)).toEqual(['run-0', 'run-2']);
  });
});

describe('laying messages out as rows', () => {
  it('opens the first row under the day stamp', () => {
    const rows = transcriptRows([message('run-0', 'assistant', at(1, 12, 15))]);
    expect(rows[0].divider).toBe('Today, 12:15 pm');
  });

  it('puts a clock stamp on a lull at or past TIME_GAP_MS, and none below it', () => {
    const first = message('run-0', 'assistant', at(1, 12, 0));
    const close = message('run-2', 'assistant', at(1, 12, 14)); // 14 min < TIME_GAP_MS
    const far = message('run-4', 'assistant', at(1, 12, 0 + TIME_GAP_MS / 60_000));
    expect(transcriptRows([first, close])[1].divider).toBeNull();
    expect(transcriptRows([first, far])[1].divider).toBe('12:15 pm');
  });

  it('puts the day stamp back when the calendar turns', () => {
    const before = message('run-0', 'assistant', at(1, 23, 59));
    const after = message('run-2', 'assistant', at(2, 0, 5));
    expect(transcriptRows([before, after])[1].divider).toBe('Today, 12:05 am');
  });

  it('pairs a run’s bubbles: continues above, continued below', () => {
    const rows = transcriptRows([
      message('run-0', 'assistant', at(1, 12, 0)),
      message('run-2', 'assistant', at(1, 12, 1)),
      message('run-4', 'user', at(1, 12, 2)),
    ]);
    expect(rows.map((row) => [row.continues, row.continued])).toEqual([
      [false, true],
      [true, false],
      [false, false],
    ]);
  });

  it('pairs only one character’s bubbles, not two speakers in one reply', () => {
    // A Flock line directly above a Cam line is two runs, so the second keeps
    // its own mark and the wider between-speakers gap: the corners never point
    // at each other across a speaker change.
    const flock = { ...message('run-0', 'assistant', at(1, 12, 0)), speaker: 'flock' };
    const cam = { ...message('run-1', 'assistant', at(1, 12, 1)), speaker: 'cam' };
    const again = { ...message('run-2', 'assistant', at(1, 12, 2)), speaker: 'cam' };
    const rows = transcriptRows([flock, cam, again]);
    expect(rows.map((row) => [row.continues, row.continued])).toEqual([
      [false, false],
      [false, true],
      [true, false],
    ]);
  });

  it('breaks a run at a divider in both directions', () => {
    const rows = transcriptRows([
      message('run-0', 'assistant', at(1, 12, 0)),
      message('run-2', 'assistant', at(1, 12, TIME_GAP_MS / 60_000)),
    ]);
    expect(rows[1].divider).toBe('12:15 pm');
    expect(rows[1].continues).toBe(false);
    // The divider breaks the run both ways: the row above does not point down
    // into the bubble below it either.
    expect(rows[0].continued).toBe(false);
  });
});
