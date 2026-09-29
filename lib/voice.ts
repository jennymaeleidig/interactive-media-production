'use client';

// The voice: animalese letter-speech under a fresh line's reveal.
//
// One shared engine, not one per bubble. An `AudioContext` is a scarce,
// expensive resource (browsers cap how many a page may open), so the context,
// the gain node, and the decoded sample library are module-level singletons,
// built lazily on the first line that speaks and reused for the conversation's
// life. A line speaks when its typewriter starts
// (`components/chat/message.tsx`), in the speaking character's own pitch
// (`lib/chat-characters.mjs`) at the piece's voice speed, with volume pushed
// live through the gain node, so the knob is heard before the next letter
// rather than the next line.
//
// Autoplay policy: a context created before a viewer gesture starts suspended, so
// every speak resumes it and the first gesture resumes it too. A line the browser
// will not let through before a gesture stays silent rather than throwing; the
// reveal is the message either way.
//
// A line's voice is a handle: `speakLine` returns it and the line stops it when
// its own typing ends. The integer token behind the handle is private to this
// module, so the "typing is the clock" rule lives here and neither the renderer
// nor the dialogue hook carries a token.
//
// Two nodes sit in series between the library's output and the speakers: an
// envelope that fades each line in at its start and out at its cut, and the
// master gain that carries the volume knob. A hard start or stop is a step in
// the waveform — an audible click, and peaking where a cut lands mid-sample — so
// both ends of a line are ramps, and the sources are stopped only after the
// outgoing ramp has landed.
//
// Citation: Stefan Legg — animalese-web (v0.1.0) [MIT]
// Source: https://github.com/stefanlegg/animalese-web
// Accessed: 2026-09-27
// A Web Audio rewrite of Acedio's animalese.js (Josh Simmons, 2014; MIT), whose
// animalese.wav sample library (CC BY 4.0) this piece self-hosts at
// public/audio/animalese.wav. See CITATION.cff and public/audio/NOTICE.txt.
//
// SPDX-License-Identifier: CC0-1.0
import { Animalese, type SpeechHandle } from 'animalese-web';
import { characterFor } from '@/lib/chat-characters.mjs';
import { ANIMALESE_WORDS_PER_MINUTE, msPerChar } from '@/lib/pacing';
import { getSettings, subscribeSettings } from '@/lib/settings';

/** Where the self-hosted sample library is served from (`public/audio`). */
const SAMPLES_URL = '/audio/animalese.wav';

/** How long the envelope takes to reach a level, at a line's start and at its
 * cut. Short enough not to soften a letter's onset — a letter is 75 ms — and
 * long enough to remove the click a step in the waveform would make. */
const VOICE_FADE_S = 0.02;

let context: AudioContext | null = null;
let gain: GainNode | null = null;
/** The fade envelope, between the library's output and the master gain. */
let fade: GainNode | null = null;
let engine: Animalese | null = null;
let loading: Promise<void> | null = null;
let active: SpeechHandle | null = null;
/** The line the voice belongs to. `speakLine` claims a fresh token per line, and
 * a handle's stop is a no-op for a token that is no longer live — so a line
 * that finished typing after a newer line had already started cannot cut the
 * newer line's voice. Zero means nothing is live. */
let activeToken = 0;
let nextToken = 0;

/** A line's voice, as the line holds it. `stop` ends the voice the handle was
 * created for; it is a no-op once a newer line has claimed the voice, so a late
 * completion cannot silence its successor. */
export interface VoiceHandle {
  stop(): void;
}
/** The pending stop of an outgoing line, held until its fade has landed. */
let stopTimer: ReturnType<typeof setTimeout> | null = null;

/** A line's entry: silence, then a ramp up, so its first sample is not a jump. */
function fadeIn(): void {
  if (!context || !fade) return;
  const now = context.currentTime;
  fade.gain.cancelScheduledValues(now);
  fade.gain.setValueAtTime(0, now);
  fade.gain.linearRampToValueAtTime(1, now + VOICE_FADE_S);
}

/** A line's exit: ramp down from wherever the envelope is now, so a stop asked
 * for mid-fade still glides rather than jumps. */
function fadeOut(): void {
  if (!context || !fade) return;
  const now = context.currentTime;
  fade.gain.cancelScheduledValues(now);
  fade.gain.setValueAtTime(fade.gain.value, now);
  fade.gain.linearRampToValueAtTime(0, now + VOICE_FADE_S);
}

/** Build the shared engine on first use; null where Web Audio is absent (SSR, or
 * a browser without it), so a caller can simply stay silent. */
function ensureVoice(): { context: AudioContext; engine: Animalese; fade: GainNode; gain: GainNode } | null {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!context || !engine || !gain || !fade) {
    context = new window.AudioContext();
    // Envelope first, master gain last, so the volume knob's node is the one
    // closest to the speakers and the envelope shapes only the line itself.
    fade = context.createGain();
    gain = context.createGain();
    gain.gain.value = getSettings().volume;
    fade.connect(gain);
    gain.connect(context.destination);
    engine = new Animalese(context, { destination: fade });
    // Decode the samples now rather than on the first line, so speech is ready
    // before a held reply lands. A load failure leaves the piece silent, not
    // broken.
    loading = engine.load(SAMPLES_URL);
    subscribeSettings(() => {
      if (gain) gain.gain.value = getSettings().volume;
    });
    // The opening turn may render before any gesture; pick up the first one so
    // the context is running by the time a line speaks.
    const resume = () => void context?.resume().catch(() => undefined);
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }
  return { context, engine, fade, gain };
}

/** Speak one line in the speaking character's own voice, from the first
 * character, and return the handle that stops it. Called when a fresh line's
 * typewriter starts; a line still speaking is faded out first, since only one
 * line types at a time (the turn schedule guarantees it, but a remount need not).
 * The line stops the handle when its own typing ends, so a superseded line
 * cannot stop the line that replaced it. */
export function speakLine(text: string, speaker: string): VoiceHandle {
  const token = (nextToken += 1);
  activeToken = token;
  const handle = { stop: () => stopToken(token) };
  const voice = ensureVoice();
  if (!voice) return handle;
  const { context, engine, gain } = voice;
  const { volume } = getSettings();
  // The pitch pair belongs to the character (`lib/chat-characters.mjs`), so two
  // speakers read as two people; the pace stays one piece constant.
  const { basePitch, pitchRange } = characterFor(speaker).voice;
  gain.gain.value = volume;
  const start = () => {
    // A newer line claimed the voice while this one waited for the samples, or
    // this line was stopped before it began: it must not speak over its
    // successor.
    if (activeToken !== token) return;
    if (active) {
      // A line is still speaking or mid-fade — a remount, or a line so short the
      // next began inside the last one's fade. Fade it out and come back once the
      // envelope has landed, rather than hard-cutting a source and clicking.
      cutActive();
      if (stopTimer) {
        setTimeout(start, VOICE_FADE_S * 1000);
        return;
      }
    }
    fadeIn();
    active = engine.speak(text, {
      basePitch,
      letterDuration: msPerChar(ANIMALESE_WORDS_PER_MINUTE) / 1000,
      pitchRange,
    });
  };
  void context.resume().catch(() => undefined);
  // The first line waits for the samples; afterwards `loading` has settled.
  void (loading ?? Promise.resolve()).then(start, () => undefined);
  return handle;
}

/** Fade the active speech and stop its sources once the ramp has landed. Leaves
 * the token alone: a line cutting its predecessor is still the live line. */
function cutActive(): void {
  const handle = active;
  if (!handle || stopTimer) return;
  if (!context || !fade) {
    active = null;
    handle.stop();
    return;
  }
  fadeOut();
  // `active` is left set until the stop lands, so a line that starts inside the
  // fade can still cut this one (`speakLine`).
  stopTimer = setTimeout(() => {
    stopTimer = null;
    handle.stop();
    if (active === handle) active = null;
  }, VOICE_FADE_S * 1000);
}

/** Cut a line's voice off now, when its handle is stopped. The typing is the
 * turn's clock, so the line stops its own voice the moment it has finished
 * typing: a voice slower than the reveal stops there rather than talking over
 * the next message, and the voice is never cut before the typing it belongs to
 * is done. A token that is not the live one is ignored, so a late completion
 * cannot silence the line that replaced it. The cut is a fade, not a stop — the
 * sources are stopped only once the ramp has landed, so the waveform is never
 * severed mid-sample. A no-op when nothing is speaking. */
function stopToken(token: number): void {
  if (token !== activeToken) return;
  activeToken = 0;
  cutActive();
}
