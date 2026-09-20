// The declaration of what the chat publishes.
//
// `pipeline/chat-assets.mjs` is read by three callers that cannot see each
// other — the asset route, the artifact check and the widget seam — so its
// shape is the contract between them: a published path, the maintained file it
// carries, and the media type it answers with.
//
// SPDX-License-Identifier: CC0-1.0
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAT_ASSETS, assetFor, readAsset } from '../pipeline/chat-assets.mjs';

describe('CHAT_ASSETS', () => {
  it('is the chat’s one shipped file: the engine and its program together', () => {
    expect(CHAT_ASSETS.map((asset) => asset.path)).toEqual(['/chat/runtime.js']);
  });

  it('publishes each path once, under /chat/', () => {
    const paths = CHAT_ASSETS.map((asset) => asset.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const asset of CHAT_ASSETS) expect(asset.path.startsWith('/chat/'), asset.path).toBe(true);
  });

  it('keeps the published extension and the carried file’s extension in step', () => {
    for (const asset of CHAT_ASSETS) {
      // the host decides the media type from the published extension, so a
      // mismatch here is a file served as the wrong kind
      expect(path.extname(asset.path), asset.path).toBe(path.extname(asset.source));
    }
  });

  it('reads every carried file, and reads it whole', () => {
    for (const asset of CHAT_ASSETS) {
      const bytes = readAsset(asset);
      expect(bytes.length, asset.source).toBeGreaterThan(0);
      expect(bytes, asset.source).toBe(readFileSync(asset.source, 'utf8'));
    }
  });
});

describe('assetFor', () => {
  it('resolves a published path to the file it carries', () => {
    expect(assetFor('/chat/runtime.js')).toEqual(CHAT_ASSETS[0]);
  });

  it('answers null for anything else, so a route cannot serve an unnamed file', () => {
    expect(assetFor('/chat/other.js')).toBeNull();
    expect(assetFor('/chat/widget.css')).toBeNull();
    expect(assetFor('/chat/')).toBeNull();
    expect(assetFor('/chat/runtime.js/..')).toBeNull();
    expect(assetFor('')).toBeNull();
  });
});
