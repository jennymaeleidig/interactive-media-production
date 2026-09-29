// The cast, pinned: one declaration of every character, and what makes one valid.
//
// `lib/chat-characters.mjs` is where a character is declared once — its mark, its
// voice pitch, its resting reveal pace. This suite is its check: the ids are
// unique and keyed by themselves, every mark is a local asset that exists on
// disk, the Yarn project's editor entries agree, and every character's resting
// pace and every preset land inside the readable band (`lib/pacing.ts`). Adding
// a character is one entry and one mark; this is what proves both halves.
//
// SPDX-License-Identifier: CC0-1.0
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAT_CHARACTERS, DEFAULT_CHARACTER_ID, characterFor, isCharacterId } from '../lib/chat-characters.mjs';
import {
  PACE_PRESETS,
  REVEAL_CEILING_WORDS_PER_MINUTE,
  REVEAL_FLOOR_WORDS_PER_MINUTE,
  revealWordsForPreset,
} from '@/lib/pacing';

const project = JSON.parse(
  readFileSync(path.join(process.cwd(), 'assets/dialogue/flock.yarnproject'), 'utf8'),
) as { editorOptions: { yarnScriptEditor: { characters: { name: string }[] } } };
const editorNames = project.editorOptions.yarnScriptEditor.characters.map((character) => character.name).sort();

describe('the cast', () => {
  it('declares each character once, keyed by its own id', () => {
    const ids = Object.keys(CHAT_CHARACTERS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id, character] of Object.entries(CHAT_CHARACTERS)) expect(character.id).toBe(id);
  });

  it('gives every character a name, a mark, and a voice', () => {
    for (const [id, character] of Object.entries(CHAT_CHARACTERS)) {
      expect(character.name.length, id).toBeGreaterThan(0);
      expect(character.mark.src.startsWith('/marks/'), id).toBe(true);
      // The mark's alt is the display name, so the transcript names its speaker
      // to assistive tech.
      expect(character.mark.alt, id).toBe(character.name);
      expect(character.voice.basePitch, id).toBeGreaterThan(0);
      expect(character.voice.pitchRange, id).toBeGreaterThanOrEqual(0);
    }
  });

  it('ships each mark as a local, self-hosted asset', () => {
    for (const character of Object.values(CHAT_CHARACTERS)) {
      expect(existsSync(path.join(process.cwd(), 'public', character.mark.src)), character.mark.src).toBe(true);
    }
  });

  it('agrees with the Yarn project’s editor characters', () => {
    // One declaration, one name: the editor's roster is the inventory's ids.
    expect(editorNames).toEqual(Object.keys(CHAT_CHARACTERS).sort());
  });

  it('falls back to a declared default for an unknown id', () => {
    expect(isCharacterId(DEFAULT_CHARACTER_ID)).toBe(true);
    expect(characterFor('nobody')).toBe(CHAT_CHARACTERS[DEFAULT_CHARACTER_ID]);
    expect(characterFor(undefined)).toBe(CHAT_CHARACTERS[DEFAULT_CHARACTER_ID]);
  });

  it('keeps every resting pace and every preset inside the readable band', () => {
    for (const character of Object.values(CHAT_CHARACTERS)) {
      const resting = character.paceWordsPerMinute;
      if (resting === undefined) continue;
      expect(resting, character.id).toBeGreaterThanOrEqual(REVEAL_FLOOR_WORDS_PER_MINUTE);
      expect(resting, character.id).toBeLessThanOrEqual(REVEAL_CEILING_WORDS_PER_MINUTE);
      for (const preset of PACE_PRESETS) {
        const pace = revealWordsForPreset(resting, preset);
        expect(pace, `${character.id}: ${preset}`).toBeGreaterThanOrEqual(REVEAL_FLOOR_WORDS_PER_MINUTE);
        expect(pace, `${character.id}: ${preset}`).toBeLessThanOrEqual(REVEAL_CEILING_WORDS_PER_MINUTE);
      }
    }
  });

  it('gives the characters different resting paces, so they read as two people', () => {
    const paces = Object.values(CHAT_CHARACTERS)
      .map((character) => character.paceWordsPerMinute)
      .filter((pace): pace is number => pace !== undefined);
    expect(paces.length).toBe(Object.keys(CHAT_CHARACTERS).length);
    expect(new Set(paces).size).toBe(paces.length);
  });
});
