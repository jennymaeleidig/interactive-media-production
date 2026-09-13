// The strip audit: the one invariant every served page has to hold.
//
// ADR 0001 removes the third-party machinery from the captured DOM and ADR 0002
// lets a video slot reach the network again; ADR 0002 states the exception is
// enforced **by the audit rather than by construction**, which is only true if
// the audit is one thing. It used to be composed across three files — the
// residue table and the census in the write pass, the reference checks in the
// embed pass, the fold in the serving check — and its Record keys were an
// undeclared interface between the two ends: the build wrote
// `{qualified: 0, onetrust: 0, ...}` and `regression/routes.mjs` read it back by
// those names. Now the invariant is `audit(html) → findings` plus
// `scriptCensus(html)`, and `MEDIA_HOSTS` — the allow-list — is this module's
// only configuration. The embed pass reads the same allow-list from here so the
// two cannot disagree about which hosts are reachable; the *rule* stays the
// audit's.
//
// What the audit counts, and why each class is separate:
//
//   residue     one regex per stripped system (the qualified-offer host, the
//               OneTrust consent stack, the account portals, known trackers,
//               an external form action). Every count must be 0. The match is
//               the *machinery's* marker, never a word: page copy legitimately
//               says "qualified", so a bare-word match would flag content.
//   frames      every `<iframe src>` must name an allow-listed media host —
//               the ADR 0002 exception, and the reason the allow-list is here.
//   remote refs the catch-all for the classes nobody has declared inert: a
//               remote URL in a fetcher position that is neither allow-listed
//               nor in a documented inert class (`poster` under the captured
//               `img-src 'self' data:`, a Lottie `data-src`, a CSS `url()`, a
//               `srcdoc` payload, an advertising `<link rel>`).
//   srcdoc      the 600-odd inlined player documents are attributes, not
//               elements, so the frame and script checks cannot see inside
//               them; this one looks, entity-decoded, and refuses a script
//               there too.
//   scripts     the census: `executable` counts capture-derived `<script>`
//               elements and must stay 0. Only `application/ld+json` data
//               blocks and the Recreation's own `data-flock-parody` runtimes
//               are allowed, which is the same rule the strip pass applies when
//               it removes a script — one predicate, `isInertScript`, so the
//               stripper and the census cannot drift apart.
//
// SPDX-License-Identifier: CC0-1.0
import { attrOf, openTags, srcdocSpans } from './html.mjs';

/**
 * The hosts a served page may reach: the live media players the embed pass
 * swaps a Capture's inert snapshot for (ADR 0002). The audit's only
 * configuration, and the embed pass reads it from here too.
 */
export const MEDIA_HOSTS = ['fast.wistia.net', 'www.youtube.com', 'www.youtube-nocookie.com'];

/**
 * The residue classes. Machinery markers, by contrast with page copy: the
 * qualified-offer host's own strings (`qualified-offer-`, `qualified.com`,
 * `_qualified-`, `q-root` and the launcher elements), the OneTrust consent
 * stack, the account portals and the Auth0 login host, the known trackers, and
 * a form action that leaves the machine.
 */
const AUDIT_RES = {
  qualified: /qualified-offer-|qualified\.com|_qualified-|q-root\b|q-focus-sentinel|q-launcher|q-messenger-frame/i,
  onetrust: /onetrust-(?:banner|pc|consent|style|accept|reject|close|privacy|policy|customize|filter)|ot-sdk|ot-sync/i,
  // no account/auth affordance or route off the machine may survive the strip
  // (the account portals and the Auth0 login host)
  account: /(?:users|login)\.flocksafety\.com/i,
  'known trackers': /googletagmanager\.com|google-analytics\.com|hotjar\.com|hockeystack\.com|bing\.com\/bat|linkedin\.com\/px|connect\.facebook\.net|snap\.licdn\.com|6sense\.com|marketo\.com|munchkin\.marketo/i,
  // a form action that leaves the machine (ticket 02): absolute or
  // protocol-relative. Injected mock actions are root-relative /api/... and
  // never match; the count must stay zero on every page.
  externalFormActions: /<form\b[^>]*?\saction\s*=\s*("|')?(?:https?:)?\/\//i,
};

/** `<script>` elements whose type makes them data rather than code. */
const LD_JSON_TYPE = /\btype\s*=\s*("|')?application\/ld\+json/i;
const SCRIPT_TAG = /<script\b[^>]*>/gi;

/**
 * Whether a `<script>` open tag is inert data rather than code. The strip pass
 * keeps what this accepts and the census counts it as non-executable, so the
 * two halves of the invariant share one rule.
 * @param {string} tag  a `<script …>` open tag
 */
export function isInertScript(tag) {
  return LD_JSON_TYPE.test(tag);
}

/**
 * Resolve the character references a `srcdoc` attribute value may carry. The
 * HTML parser decodes entities in an attribute value before the frame document
 * is instantiated, so `&lt;script&gt;` is a real script; scanning the raw value
 * would miss it — the same self-validating-checker failure this audit exists to
 * close.
 * @param {string} value
 * @returns {string}
 */
export function decodeEntities(value) {
  return value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&');
}

/**
 * Scripts living inside `srcdoc` payloads. The script census counts them only
 * by accident (SingleFile leaves `<` raw inside the attribute value), so this
 * makes the check explicit: `executable` must be zero on every served page.
 * `allowScripts`/`allowScriptsExecutable` name the one captured `allow-scripts`
 * widget document that carries only ld+json, so the build can report it rather
 * than leaving it silent.
 * @param {string} html
 * @returns {{total: number, executable: number, allowScripts: number, allowScriptsExecutable: number}}
 */
export function srcdocScripts(html) {
  let total = 0;
  let executable = 0;
  let allowScripts = 0;
  let allowScriptsExecutable = 0;
  for (const span of srcdocSpans(html)) {
    const tags = decodeEntities(span.value).match(SCRIPT_TAG) ?? [];
    if (tags.length === 0) continue;
    const exec = tags.filter((t) => !LD_JSON_TYPE.test(t)).length;
    total += tags.length;
    executable += exec;
    const sandbox = attrOf(span.tag, 'sandbox') ?? '';
    if (/\ballow-scripts\b/.test(sandbox)) {
      allowScripts += 1;
      allowScriptsExecutable += exec;
    }
  }
  return { total, executable, allowScripts, allowScriptsExecutable };
}

// The attributes a browser fetches on load, by element (ticket 20). Everything
// here is a *fetch*; an `<a href>` or a `<link rel=canonical>` is navigation or
// metadata and is not on the list.
const FETCHERS = {
  iframe: ['src'],
  frame: ['src'],
  script: ['src'],
  embed: ['src'],
  img: ['src', 'srcset'],
  source: ['src', 'srcset'],
  video: ['src', 'poster'],
  audio: ['src'],
  track: ['src'],
  object: ['data'],
  input: ['src'],
  link: ['href'],
};

// A <link> whose rel only advertises the URL — a browser never fetches it.
const NON_FETCHING_REL = /^(?:canonical|alternate|author|help|license|next|prev|search|dns-prefetch|preconnect|amphtml)$/i;
const ABSOLUTE_URL = /^(?:https?:)?\/\//i;

/**
 * Remote references in a class the audit does not know to be inert: a fetcher
 * attribute on an element that would actually ask the network for it (ticket
 * 20). The known classes are accepted in writing (ADR 0002) — an allow-listed
 * `<iframe src>`, a `poster` (`img-src` refuses it, or the element never asks),
 * a Lottie `data-src` (`connect-src 'self'`), a CSS `url()` (`img-src`), and a
 * `srcdoc` payload (sandboxed; see `srcdocScripts`). This must be empty on
 * every served page: a future Capture must not be able to introduce a fetched
 * reference in an unexpected class unnoticed.
 * @param {string} html
 * @returns {string[]}
 */
export function unclassifiedRemoteRefs(html) {
  // Script and style bodies are code, not markup; drop them so a string that
  // looks like a tag inside a runtime is not read as one.
  const markup = html
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi, '$1$2')
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style\s*>)/gi, '$1$2');
  const refs = [];
  for (const tag of openTags(markup)) {
    const name = tag.name.toLowerCase();
    const attrs = tag.attrs;
    if (name === 'meta') continue; // metadata — a crawler may read it, a browser never fetches it
    const rel = attrOf(attrs, 'rel') ?? '';
    for (const attr of FETCHERS[name] ?? []) {
      const value = attrOf(attrs, attr);
      if (value === null) continue;
      const candidates = attr.endsWith('srcset')
        ? value.split(',').map((part) => part.trim().split(/\s+/)[0])
        : [value];
      for (const url of candidates) {
        if (!ABSOLUTE_URL.test(url)) continue;
        if (attr === 'poster') continue; // inert class — img-src refuses it / the element never asks
        if ((name === 'iframe' || name === 'frame') && MEDIA_HOSTS.includes(hostOf(url))) continue; // the ADR's exception
        if (name === 'link' && NON_FETCHING_REL.test(rel)) continue; // advertises, never fetches
        refs.push(url);
      }
    }
  }
  // A CSS `url()` is img-src-governed and so accepted above; `@import` is not.
  for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    for (const imp of style[1].matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
      if (ABSOLUTE_URL.test(imp[1])) refs.push(imp[1]);
    }
  }
  // A meta refresh navigates away rather than fetching on load, but it still
  // names a remote host and the audit must see it.
  for (const meta of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\bhttp-equiv\s*=\s*("|')?refresh/i.test(meta[0])) continue;
    const url = /url\s*=\s*([^;]+)/i.exec(attrOf(meta[0], 'content') ?? '')?.[1]?.trim() ?? '';
    if (ABSOLUTE_URL.test(url)) refs.push(url);
  }
  return refs;
}

/**
 * Every absolute `<iframe src>` on the page.
 * @param {string} html
 * @returns {string[]}
 */
export function iframeSources(html) {
  const urls = [];
  for (const m of html.matchAll(/<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const url = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (/^(?:https?:)?\/\//i.test(url)) urls.push(url);
  }
  return urls;
}

/**
 * @param {string} url
 * @returns {string} its host, or the url itself when unparseable
 */
export function hostOf(url) {
  try {
    return new URL(url.startsWith('//') ? `https:${url}` : url).host;
  } catch {
    return url;
  }
}

/**
 * Frames pointed somewhere the allow-list does not name — must be empty on
 * every served page.
 * @param {string} html
 * @returns {string[]}
 */
export function offAllowlistFrames(html) {
  return iframeSources(html).filter((url) => !MEDIA_HOSTS.includes(hostOf(url)));
}

/**
 * Script census of served bytes. `executable` counts capture-derived scripts —
 * must stay 0 (the audit invariant). `ldJson` are inert data blocks; `injected`
 * are the Recreation's own marked runtimes (data-flock-parody);
 * `srcdocAllowScripts` counts `srcdoc` frames whose sandbox carries
 * `allow-scripts` (today: one captured cvt-embed document carrying only
 * ld+json), reported so that case is visible rather than silent.
 * @param {string} html
 * @returns {{total: number, executable: number, ldJson: number, injected: number, srcdocAllowScripts: number}}
 */
export function scriptCensus(html) {
  const tags = html.match(/<script\b[^>]*>/gi) ?? [];
  const injected = tags.filter((t) => /data-flock-parody=/i.test(t)).length;
  const ldJson = tags.filter((t) => isInertScript(t)).length;
  const executable = tags.length - injected - ldJson;
  return { total: tags.length, executable, ldJson, injected, srcdocAllowScripts: srcdocScripts(html).allowScripts };
}

/**
 * The strip audit of one page's served bytes: residue class → count, plus the
 * three reference checks. Every count must be 0. The key names are the
 * interface the serving check folds (`regression/routes.mjs`), so they are
 * frozen for the tree that already carries them.
 * @param {string} html
 * @returns {Record<string, number>}
 */
export function audit(html) {
  const findings = {};
  for (const [name, re] of Object.entries(AUDIT_RES)) {
    findings[name] = (html.match(new RegExp(re.source, re.flags.replace('g', '') + 'g')) || []).length;
  }
  // ADR 0002's exception is enforced here rather than held by construction: a
  // frame may only point at an allow-listed media host. Image-side remote
  // references (a captured `poster=`, a Lottie `data-src`) are refused by the
  // captured `img-src 'self' data:` and so are not part of this count.
  findings['off-allowlist frames'] = offAllowlistFrames(html).length;
  // The frame audit reads absolute `src` values only, and the script census
  // reads `<script>` open tags — neither says anything about the 600-odd
  // `srcdoc` payloads in the tree (ticket 20). `srcdoc scripts` looks inside
  // them: an executable script there fails the invariant instead of relying on
  // what SingleFile happened to drop.
  findings['srcdoc scripts'] = srcdocScripts(html).executable;
  // The catch-all for the reference classes nobody has declared inert — a
  // remote reference in a fetcher position that is neither on the media
  // allow-list nor in a documented inert class (ticket 20).
  findings['unclassified remote refs'] = unclassifiedRemoteRefs(html).length;
  return findings;
}
