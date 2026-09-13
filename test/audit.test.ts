// The strip audit: the one invariant every served page holds. The serving check
// computes the findings on the served bytes; pure, so they are pinned here
// rather than only through the site build.
//
// SPDX-License-Identifier: CC0-1.0
import { describe, expect, it } from 'vitest';
import {
  audit,
  iframeSources,
  isInertScript,
  MEDIA_HOSTS,
  offAllowlistFrames,
  scriptCensus,
  srcdocScripts,
  unclassifiedRemoteRefs,
} from '../pipeline/audit.mjs';

describe('the residue classes', () => {
  it('reads a clean page as all zeros', () => {
    const html = `<html><body><p>Hello</p><form action=/api/mock></form></body></html>`;
    expect(audit(html)).toEqual({
      qualified: 0,
      onetrust: 0,
      account: 0,
      'known trackers': 0,
      externalFormActions: 0,
      'off-allowlist frames': 0,
      'srcdoc scripts': 0,
      'unclassified remote refs': 0,
    });
  });

  it('names the machine of each stripped vendor, never the English word', () => {
    expect(audit(`<div class=q-root-qualified></div>`).qualified).toBe(1);
    expect(audit(`<script src="/onetrust-banner.js"></script>`).onetrust).toBe(1);
    expect(audit(`<a href="https://users.flocksafety.com/login">Sign in</a>`).account).toBe(1);
    expect(audit(`<script src="https://www.googletagmanager.com/gtag/js"></script>`)['known trackers']).toBe(1);
    expect(audit(`<form action="https://evil.example/submit"></form>`).externalFormActions).toBe(1);
  });

  it('does not flag the brand string or the ordinary word the corpus uses', () => {
    // the footer link and page copy legitimately carry these words
    const html = `<a>Your Privacy Choices</a><p>qualified electrician, qualified applicants</p>`;
    const findings = audit(html);
    expect(findings.qualified).toBe(0);
    expect(findings.onetrust).toBe(0);
  });
});

describe('the script census', () => {
  it('keeps inert data blocks and the Recreation’s own runtimes out of `executable`', () => {
    const html = `<script type=application/ld+json>{}</script>`
      + `<script data-flock-parody=motion>1</script>`
      + `<script>alert(1)</script>`;
    expect(scriptCensus(html)).toEqual({ total: 3, executable: 1, ldJson: 1, injected: 1, srcdocAllowScripts: 0 });
  });

  it('accepts ld+json in every quote form the captures write', () => {
    expect(isInertScript(`<script type="application/ld+json">`)).toBe(true);
    expect(isInertScript(`<script type='application/ld+json'>`)).toBe(true);
    expect(isInertScript(`<script type=application/ld+json>`)).toBe(true);
    expect(isInertScript(`<script>`)).toBe(false);
    expect(isInertScript(`<script type=module>`)).toBe(false);
  });

  it('reports the one captured allow-scripts payload rather than leaving it silent', () => {
    const html = `<iframe sandbox="allow-scripts" srcdoc="<script type=application/ld+json>{}</script>"></iframe>`;
    expect(scriptCensus(html).srcdocAllowScripts).toBe(1);
  });
});

describe('the srcdoc script check (ticket 20)', () => {
  it('sees a script inside a srcdoc payload — the census could only see it by luck', () => {
    expect(srcdocScripts(`<iframe srcdoc="<script>alert(1)</script>"></iframe>`).executable).toBe(1);
  });

  it('treats the captured allow-scripts ld+json payload as benign', () => {
    const html = `<iframe sandbox="allow-scripts" srcdoc="<script nonce type=application/ld+json>{}</script>"></iframe>`;
    expect(srcdocScripts(html)).toEqual({ total: 1, executable: 0, allowScripts: 1, allowScriptsExecutable: 0 });
  });

  it('counts only the srcdoc payloads, never the page scripts outside them', () => {
    const html = `<script data-flock-parody>1</script><iframe srcdoc="<script>alert(1)</script>"></iframe>`;
    expect(srcdocScripts(html).executable).toBe(1);
  });

  it('sees an entity-escaped script, which the parser decodes before the frame runs', () => {
    // The raw attribute value has no `<`, but the browser decodes `&lt;` before
    // instantiating the frame — scanning the raw value would score this 0.
    const html = `<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>`;
    expect(srcdocScripts(html).executable).toBe(1);
  });
});

describe('the remote-reference class check (ticket 20)', () => {
  it('flags a remote reference in an unexpected fetcher position', () => {
    expect(unclassifiedRemoteRefs(`<img src="https://evil.example/x.jpg">`)).toEqual(['https://evil.example/x.jpg']);
    expect(unclassifiedRemoteRefs(`<link rel=stylesheet href="https://evil.example/x.css">`)).toEqual(['https://evil.example/x.css']);
    expect(unclassifiedRemoteRefs(`<script src="https://evil.example/x.js"></script>`)).toEqual(['https://evil.example/x.js']);
  });

  it('accepts the documented inert classes and the allow-listed frames', () => {
    const html = `<iframe src="https://fast.wistia.net/embed/iframe/llllllllll"></iframe>`
      + `<video poster="https://r2.example/p.jpg"></video>`
      + `<div data-animation-type=lottie data-src="https://cdn.example/a.json"></div>`
      + `<meta property=og:image content="https://cdn.example/a.png">`
      + `<a href="https://external.example/page">link</a>`
      + `<link rel=canonical href="https://www.example.com/page">`;
    expect(unclassifiedRemoteRefs(html)).toEqual([]);
  });

  it('flags a remote @import in a stylesheet', () => {
    expect(unclassifiedRemoteRefs(`<style>@import url(https://evil.example/x.css);</style>`)).toEqual(['https://evil.example/x.css']);
  });

  it('does not read a `data-src` as a `src`', () => {
    expect(unclassifiedRemoteRefs(`<img data-src="https://cdn.example/a.jpg">`)).toEqual([]);
  });

  it('reads a tag carrying a multi-megabyte unquoted data URI without overflowing (ticket 12)', () => {
    // SingleFile writes an inlined video source unquoted: `src=data:video/mp4;base64,…`.
    // The retired alternation regex recursed once per scanned unit and blew the
    // engine's stack above ~10 MB of value.
    const big = 'A'.repeat(12_000_000);
    const html = `<source data-wf-ignore=true src=data:video/mp4;base64,${big}><iframe data-video-id=lV1WCvNGnmM></iframe>`;
    expect(unclassifiedRemoteRefs(html)).toEqual([]);
  });
});

describe('the frame allow-list', () => {
  it('reads absolute iframe sources', () => {
    expect(iframeSources(`<iframe src="https://a.example/x"></iframe><iframe src=/local></iframe>`)).toEqual(['https://a.example/x']);
  });

  it('flags a frame outside the allow-list, and passes the media hosts', () => {
    expect(offAllowlistFrames(`<iframe src="https://evil.example/x">`)).toEqual(['https://evil.example/x']);
    expect(offAllowlistFrames(`<iframe src="https://fast.wistia.net/embed/iframe/llllllllll">`)).toEqual([]);
    expect(offAllowlistFrames(`<iframe src="https://www.youtube.com/embed/abcdefghijk">`)).toEqual([]);
    // the privacy-enhanced host is the one three captured blog frames name
    expect(offAllowlistFrames(`<iframe src="https://www.youtube-nocookie.com/embed/abcdefghijk">`)).toEqual([]);
    expect(MEDIA_HOSTS).toEqual(['fast.wistia.net', 'www.youtube.com', 'www.youtube-nocookie.com']);
  });

  it('does not flag image-side remote references (CSP refuses those, not this audit)', () => {
    const html = `<video poster="https://r2.vidzflow.com/thumbnails/x.jpg"></video><img data-src="https://cdn.example/a.json">`;
    expect(offAllowlistFrames(html)).toEqual([]);
  });
});
