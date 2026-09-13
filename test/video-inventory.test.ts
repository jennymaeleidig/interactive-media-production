// Detection seams for the video inventory (ticket 17's first criterion).
//
// Why this file exists at all: every id the inventory cannot see is an id the
// build cannot act on, and on 2026-09-11 that shipped a live frame to a dead
// Wistia player. The failing input was an *attribute* — a slot that names its
// media without ever writing a URL — so the boundary rules below are the
// load-bearing part: they must catch every real `media-id` and nothing else.
//
// Only the Wistia sweep lives here. YouTube's `data-video-id` panels are the
// embed pass's own detection (`pipeline/embeds.mjs`'s `youtubeSlots`), pinned
// beside it in the ticket-17 describe at `test/embeds.test.ts`.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { wistiaFromPage } from '../pipeline/video-inventory.mjs';

describe('attribute-form slot detection', () => {
  it('reads no Wistia media from a numeric data-video-id frame', () => {
    // Vidzflow's hidden player document: the numeric id is not Wistia's, and
    // the pass strips the document (ticket 19) rather than rewriting a slot.
    const { wistia } = wistiaFromPage(`<iframe data-video-id=32614 srcdoc="<video-js></video-js>"></iframe>`);
    expect([...wistia.keys()]).toEqual([]);
  });

  it('sees a <wistia-player media-id> slot, quoted or not', () => {
    const unquoted = wistiaFromPage(`<wistia-player media-id=tthkbjay3c aspect=1.777></wistia-player>`);
    expect([...unquoted.wistia.keys()]).toEqual(['tthkbjay3c']);
    const quoted = wistiaFromPage(`<wistia-player media-id="tthkbjay3c"></wistia-player>`);
    expect([...quoted.wistia.keys()]).toEqual(['tthkbjay3c']);
  });

  it('sees the media-id inside a captured CSS attribute selector', () => {
    // The shape that hid tthkbjay3c: the slot markup itself was gone, but the
    // page still named the media in its own stylesheet.
    const html = `<style>wistia-player[media-id="tthkbjay3c"]:not(*){padding-top:56.25%}</style>`;
    const { wistia } = wistiaFromPage(html);
    expect([...wistia.keys()]).toEqual(['tthkbjay3c']);
    expect([...wistia.get('tthkbjay3c')!.contexts]).toEqual(['embed']);
  });

  it('does not read a media-id that is not exactly 10 id characters', () => {
    const { wistia } = wistiaFromPage(`<div id=not-a-media-id media-id=tooolongvalue></div><div data-media-id=abcdefghij></div>`);
    expect([...wistia.keys()]).toEqual([]);
  });

  it('keeps contexts when a slot names a video twice', () => {
    // A slot its own JSON-LD also names is `both`, not a duplicate entry.
    const html = `<wistia-player media-id=tthkbjay3c></wistia-player><a href="https://flocksafety.wistia.com/medias/tthkbjay3c">Watch</a>`;
    const { wistia } = wistiaFromPage(html);
    expect([...wistia.get('tthkbjay3c')!.contexts].sort()).toEqual(['embed', 'link']);
  });
});
