// @vitest-environment jsdom
//
// The voice's character wiring (`lib/voice`): each character speaks in its own
// pitch, at the piece's one voice speed, and volume is carried by a gain node
// that follows the knob live. The audio engine is mocked — `animalese-web` and a
// fake `AudioContext` — because what is under test is the mapping from character
// and settings to engine, not the synthesis.
//
// SPDX-License-Identifier: CC0-1.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const fake = vi.hoisted(() => {
  interface Param {
    value: number;
    cancelScheduledValues: (time: number) => void;
    linearRampToValueAtTime: (value: number, time: number) => void;
    setValueAtTime: (value: number, time: number) => void;
  }
  interface Gain {
    gain: Param;
    connect: () => void;
  }
  const gains: Gain[] = [];
  const speak = vi.fn((_text: string, _options?: unknown) => ({
    finished: Promise.resolve(),
    pause: vi.fn(),
    resume: vi.fn(),
    state: 'playing' as const,
    stop: vi.fn(),
  }));
  const load = vi.fn(() => Promise.resolve());
  class Animalese {
    load = load;
    speak = speak;
  }
  class AudioContext {
    currentTime = 0;
    destination = {};
    resume = () => Promise.resolve();
    createGain(): Gain {
      const param: Param = {
        cancelScheduledValues: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        value: 0,
      };
      const node: Gain = { connect: vi.fn(), gain: param };
      gains.push(node);
      return node;
    }
  }
  return { Animalese, AudioContext, gains, speak };
});

vi.mock('animalese-web', () => ({ Animalese: fake.Animalese }));

import { characterFor } from '@/lib/chat-characters.mjs';
import { ANIMALESE_WORDS_PER_MINUTE, msPerChar } from '@/lib/pacing';
import { resetSettings, updateSettings } from '@/lib/settings';
import { speakLine } from '@/lib/voice';

/** The options the library was last asked to speak with. */
const lastOptions = () =>
  fake.speak.mock.calls.at(-1)?.[1] as unknown as { basePitch: number; letterDuration: number; pitchRange: number };

describe('the voice and the character', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', fake.AudioContext);
    resetSettings();
    fake.speak.mockClear();
  });

  it("speaks in the character's own pitch, at the piece's voice speed", async () => {
    updateSettings({ volume: 0.4 });

    speakLine('hello there', 'cam');
    await waitFor(() => expect(fake.speak).toHaveBeenCalled());

    const cam = characterFor('cam').voice;
    const options = lastOptions();
    expect(options.basePitch).toBe(cam.basePitch);
    expect(options.pitchRange).toBe(cam.pitchRange);
    expect(options.letterDuration).toBeCloseTo(msPerChar(ANIMALESE_WORDS_PER_MINUTE) / 1000, 9);

    // The gain node carries the knob: a change is heard without a new line.
    const master = fake.gains.at(-1);
    expect(master?.gain.value).toBe(0.4);
    updateSettings({ volume: 0.1 });
    expect(master?.gain.value).toBe(0.1);
  });

  it('ignores a superseded line’s stop, so a late completion cannot silence the new line', async () => {
    const stale = speakLine('one', 'cam');
    await waitFor(() => expect(fake.speak).toHaveBeenCalledTimes(1));
    const fresh = speakLine('two', 'cam');
    await waitFor(() => expect(fake.speak).toHaveBeenCalledTimes(2));

    const handle = fake.speak.mock.results.at(-1)?.value as unknown as { stop: () => void };
    // The first line's typewriter finishes later: its handle is no longer live,
    // so its stop is ignored and the second line keeps speaking.
    stale.stop();
    expect(handle.stop).not.toHaveBeenCalled();

    fresh.stop();
    await waitFor(() => expect(handle.stop).toHaveBeenCalled());
  });

  it('gives each character its own pitch, so two speakers read as two people', async () => {
    speakLine('one', 'flock');
    await waitFor(() => expect(fake.speak).toHaveBeenCalled());
    const flock = lastOptions();
    fake.speak.mockClear();
    speakLine('two', 'cam');
    await waitFor(() => expect(fake.speak).toHaveBeenCalled());
    const cam = lastOptions();
    expect(cam.basePitch).not.toBe(flock.basePitch);
  });

  it('fades a line in at its start and out before cutting it', async () => {
    const line = speakLine('hello there', 'cam');
    await waitFor(() => expect(fake.speak).toHaveBeenCalled());
    // Two nodes in series: the envelope first, the volume knob's master second.
    const envelope = fake.gains[0];
    // Entry: jump to silence, then ramp up. The jump is inaudible because nothing
    // is playing yet; the ramp is what keeps the first sample from clicking.
    expect(envelope.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(envelope.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, expect.any(Number));

    const handle = fake.speak.mock.results.at(-1)?.value as unknown as { stop: () => void };
    line.stop();
    // Exit: ramp to silence first, and only stop the sources once it has landed —
    // stopping first would sever the waveform mid-sample, the click this removes.
    expect(handle.stop).not.toHaveBeenCalled();
    expect(envelope.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    await waitFor(() => expect(handle.stop).toHaveBeenCalled());
  });
});
