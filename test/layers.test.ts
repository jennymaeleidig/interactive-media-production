// The injected layers, one record each (pipeline/layers.mjs). Every layer's
// marker, inline files, mount predicate, and CSP grant lives in the table the
// build reads, so this file pins the table rather than the six hand-kept
// call sites it replaced — including that a new layer is one record.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAYERS,
  MARKER_ATTR,
  MARKER_RE,
  grantLayer,
  injectBeforeClose,
  layerFile,
  layerNamed,
  layerTag,
  mountLayer,
  readLayerBodies,
} from '../pipeline/layers.mjs';
import { readCsp } from '../pipeline/csp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE = path.join(HERE, '../pipeline');
const BODIES = readLayerBodies();

function entry(extra: Record<string, unknown> = {}): { page: string; warnings: string[]; [key: string]: unknown } {
  return { page: '/', warnings: [] as string[], ...extra };
}

describe('layer table', () => {
  it('names every layer once and mounts each under its own marker', () => {
    const names = LAYERS.map((layer) => layer.name);
    expect(new Set(names).size).toBe(names.length);
    for (const layer of LAYERS) {
      expect(layer.label).toBeTruthy();
      expect(MARKER_RE.test(`<style ${MARKER_ATTR}="${layer.name}">`)).toBe(true);
      const html = mountLayer('<html><body></body></html>', entry(), layer, BODIES.get(layer.name)!);
      for (const part of layer.parts) {
        expect(html, layer.name).toContain(`<${part} ${MARKER_ATTR}="${layer.name}">`);
      }
    }
  });

  it('names only files that exist, and only for the halves it ships', () => {
    for (const layer of LAYERS) {
      if (layer.css !== null) {
        expect(existsSync(path.join(PIPELINE, layerFile(layer.name, 'css'))), layer.name).toBe(true);
        expect(BODIES.get(layer.name)?.css, layer.name).toBeTruthy();
      } else {
        expect(() => layerFile(layer.name, 'css')).toThrow();
      }
      if (layer.runtime !== null) {
        expect(existsSync(path.join(PIPELINE, layerFile(layer.name, 'runtime'))), layer.name).toBe(true);
        expect(BODIES.get(layer.name)?.runtime, layer.name).toBeTruthy();
      } else {
        expect(() => layerFile(layer.name, 'runtime')).toThrow();
      }
    }
  });

  it('mounts a new layer as one record', () => {
    const record = {
      name: 'disclaimer',
      label: 'disclaimer banner (style, inline)',
      parts: ['style'] as ('style' | 'script')[],
      css: null,
      runtime: null,
      mounts: () => true,
      grants: [],
    };
    const e = entry();
    const html = mountLayer('<body></body>', e, record, { css: '.sf-banner{color:red}' });
    expect(html).toContain('<style data-flock-parody="disclaimer">\n.sf-banner{color:red}\n</style>');
    expect(e.injected).toEqual(['disclaimer banner (style, inline)']);
  });

  it('trims the page-scoped legibility body', () => {
    const e = entry();
    const html = mountLayer('<body></body>', e, layerNamed('legibility'), { css: '  .x{color:#fff}  ' });
    expect(html).toContain('<style data-flock-parody="legibility">\n.x{color:#fff}\n</style>');
  });

  it('mounts only when the layer predicate says so', () => {
    expect(layerNamed('chat').mounts({}, {})).toBe(false);
    expect(layerNamed('chat').mounts({ chatLauncher: true }, {})).toBe(true);
    expect(layerNamed('legibility').mounts({}, { page: '/a', legibilityPatches: {} })).toBe(false);
    expect(layerNamed('legibility').mounts({}, { page: '/a', legibilityPatches: { '/a': '.x{}' } })).toBe(true);
    expect(layerNamed('motion').mounts({}, {})).toBe(true);
  });

  it('inserts before </body>, or at EOF for a truncated capture', () => {
    const e = entry();
    expect(injectBeforeClose('<body>x</body>', e, layerNamed('motion'), '<i>')).toBe('<body>x<i>\n</body>');
    expect(injectBeforeClose('<body>x', e, layerNamed('motion'), '<i>')).toBe('<body>x\n<i>');
    expect(e.injected).toEqual(['motion layer (style+script, inline)', 'motion layer (style+script, inline)']);
  });

  it('applies a layer grant through the record, logging its note once', () => {
    const html = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; frame-src \'self\' data:">';
    const e = entry();
    const out = grantLayer(html, e, layerNamed('chat'));
    expect(readCsp(out)?.value).toContain("connect-src 'self'");
    expect(e.csp).toBe("connect-src 'self' (chat mount)");
    // pass 14's replace-not-append invariant, seen from the table: a second
    // grant adds nothing
    expect(grantLayer(out, e, layerNamed('chat'))).toBe(out);
    expect(e.csp).toBe("connect-src 'self' (chat mount)");
  });

  it('warns and leaves the policy when the page carries no CSP meta', () => {
    const e = entry();
    const html = '<html><body></body></html>';
    expect(grantLayer(html, e, layerNamed('chat'))).toBe(html);
    expect(e.warnings).toEqual(['chat: no CSP meta found — the widget POST may be blocked']);
  });

  it('joins halves with one newline and throws for an unknown layer', () => {
    expect(layerTag(layerNamed('story-hook'), { runtime: 'R' })).toBe('<script data-flock-parody="story-hook">\nR\n</script>');
    expect(() => layerNamed('nope')).toThrow('unknown layer');
  });
});
