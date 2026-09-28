// @vitest-environment jsdom
//
// The voice's settings wiring (`lib/voice`): pitch and speed are read when a line
// starts, volume is carried by a gain node and follows the knob live. The audio
// engine is mocked — `animalese-web` and a fake `AudioContext` — because what is
// under test is the mapping from settings to engine, not the synthesis.
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

import { msPerChar } from '@/lib/pacing';
import { resetSettings, updateSettings } from '@/lib/settings';
import { speakLine, stopVoice } from '@/lib/voice';

describe('the voice settings', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', fake.AudioContext);
    resetSettings();
    fake.speak.mockClear();
  });

  it("speaks at the viewer's pitch and speed, and follows the volume knob live", async () => {
    updateSettings({ basePitch: 1.5, pitchRange: 0.1, voiceWordsPerMinute: 300, volume: 0.4 });

    speakLine('hello there');
    await waitFor(() => expect(fake.speak).toHaveBeenCalled());

    const options = fake.speak.mock.calls.at(-1)?.[1] as unknown as {
      basePitch: number;
      letterDuration: number;
      pitchRange: number;
    };
    expect(options.basePitch).toBe(1.5);
    expect(options.pitchRange).toBe(0.1);
    expect(options.letterDuration).toBeCloseTo(msPerChar(300) / 1000, 9);

    // The gain node carries the knob: a change is heard without a new line.
    const master = fake.gains.at(-1);
    expect(master?.gain.value).toBe(0.4);
    updateSettings({ volume: 0.1 });
    expect(master?.gain.value).toBe(0.1);
  });

  it('fades a line in at its start and out before cutting it', async () => {
    speakLine('hello there');
    await waitFor(() => expect(fake.speak).toHaveBeenCalled());
    // Two nodes in series: the envelope first, the volume knob's master second.
    const envelope = fake.gains[0];
    // Entry: jump to silence, then ramp up. The jump is inaudible because nothing
    // is playing yet; the ramp is what keeps the first sample from clicking.
    expect(envelope.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(envelope.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, expect.any(Number));

    const handle = fake.speak.mock.results.at(-1)?.value as unknown as { stop: () => void };
    stopVoice();
    // Exit: ramp to silence first, and only stop the sources once it has landed —
    // stopping first would sever the waveform mid-sample, the click this removes.
    expect(handle.stop).not.toHaveBeenCalled();
    expect(envelope.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    await waitFor(() => expect(handle.stop).toHaveBeenCalled());
  });
});
