// Detection seams for the video inventory (ticket 17's first criterion).
//
// Why this file exists at all: every id the inventory cannot see is an id the
// dead-media list never learns about, and on 2026-09-11 that shipped a live
// frame to a dead Wistia player. The failing input was an *attribute* — a slot
// that names its media without ever writing a URL — so the boundary rules below
// are the load-bearing part: they must catch every real slot attribute and
// nothing else.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import { extractFromPage, wistiaFromPage } from '../pipeline/video-inventory.mjs';

describe('attribute-form slot detection', () => {
  it('sees a src-less YouTube slot', () => {
    const html = `<iframe data-video-id=czWZT0qQ5HU class=th_video id=youtube-player-3></iframe>`;
    const { youtube } = extractFromPage(html);
    expect([...youtube.keys()]).toEqual(['czWZT0qQ5HU']);
    expect([...youtube.get('czWZT0qQ5HU')!]).toEqual(['embed']);
  });

  it('sees a quoted attribute value', () => {
    const { youtube } = extractFromPage(`<iframe data-video-id="yBQN9orr_Ho"></iframe>`);
    expect([...youtube.keys()]).toEqual(['yBQN9orr_Ho']);
  });

  it('does not read a longer attribute whose name merely ends in data-video-id', () => {
    const { youtube } = extractFromPage(`<div data-data-video-id=czWZT0qQ5HU></div>`);
    expect([...youtube.keys()]).toEqual([]);
  });

  it('does not read an 11-char prefix of a longer id', () => {
    // podcast.html's episode buttons carry 24-char ids; matching their prefix
    // invented a YouTube video that does not exist.
    const { youtube } = extractFromPage(`<button data-video-id=7hyzp0tDLlLVy2BWG284Qt>x</button>`);
    expect([...youtube.keys()]).toEqual([]);
  });

  it('does not read Vidzflow’s numeric data-video-id', () => {
    const { youtube, wistia } = extractFromPage(`<iframe data-video-id=32614 srcdoc="<video-js></video-js>"></iframe>`);
    expect([...youtube.keys()]).toEqual([]);
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
