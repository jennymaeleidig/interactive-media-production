// Route-check pure core (ticket 07): expectation building and the whole-site
// count invariant. The check itself is environmental (it needs the built app
// and the served tree), so it is not a test-suite member — but its derivation
// from the build's route classes is pure and locked here.
import { describe, it, expect } from 'vitest';
import { auditFailures, countFailures, formatRouteCounts, routeExpectations } from '../regression/routes.mjs';

describe('routeExpectations', () => {
  it('names a status for every route class', () => {
    const { expectations, conflicts } = routeExpectations({
      served: ['/', '/book-a-demo'],
      dropped: ['/form-test'],
      redirects: { '/legal/privacy-notice': '/legal/privacy-policy' },
      dead: ['/ebooks'],
      authGated: ['/events/test-event'],
    });
    expect(conflicts).toEqual([]);
    expect(expectations).toEqual([
      { path: '/', status: 200 },
      { path: '/book-a-demo', status: 200 },
      { path: '/legal/privacy-notice', status: 301, location: '/legal/privacy-policy' },
      { path: '/form-test', status: 404 },
      { path: '/ebooks', status: 404 },
      { path: '/events/test-event', status: 404 },
    ]);
  });

  it('treats an empty route set as no expectations, not an error', () => {
    const { expectations, conflicts } = routeExpectations({ served: [], dropped: [], redirects: {}, dead: [], authGated: [] });
    expect(expectations).toEqual([]);
    expect(conflicts).toEqual([]);
  });

  it('reports a path claimed by two classes and keeps the more specific one', () => {
    const { expectations, conflicts } = routeExpectations({
      served: ['/book-a-demo'],
      dropped: [],
      redirects: { '/book-a-demo': '/thank-you' },
      dead: [],
      authGated: [],
    });
    expect(conflicts).toEqual(['/book-a-demo: 200 vs 301']);
    expect(expectations).toEqual([{ path: '/book-a-demo', status: 200 }]);
  });

  it('does not report two identical expectations as a conflict', () => {
    const { conflicts } = routeExpectations({
      served: [],
      dropped: ['/form-test'],
      redirects: {},
      dead: ['/form-test'],
      authGated: [],
    });
    expect(conflicts).toEqual([]);
  });
});

describe('countFailures', () => {
  it('accepts served + dropped + errors === the inventory listing', () => {
    expect(countFailures({ served: 1180, dropped: 19, errors: 0, listing: 1199 })).toEqual([]);
  });

  it('fails when the served tree accounts for fewer pages than the inventory lists', () => {
    const failures = countFailures({ served: 1180, dropped: 0, errors: 0, listing: 1199 });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('1180 served + 0 dropped + 0 errors = 1180, but the inventory lists 1199');
  });
});

describe('auditFailures', () => {
  it('passes a corpus with zero residue and no executable scripts', () => {
    expect(auditFailures([
      { page: '/', audit: { qualified: 0, onetrust: 0 }, scripts: { executable: 0 } },
      { page: '/book-a-demo', audit: { qualified: 0 }, scripts: { executable: 0 } },
    ])).toEqual([]);
  });

  it('names every page with tracker residue or a capture-derived executable script', () => {
    const failures = auditFailures([
      { page: '/bad', audit: { qualified: 2, onetrust: 0 }, scripts: { executable: 0 } },
      { page: '/worse', audit: { qualified: 0 }, scripts: { executable: 1 } },
      { page: '/missing', error: 'capture file missing' },
    ]);
    expect(failures).toEqual([
      '/bad: tracker residue qualified=2',
      '/worse: 1 executable script(s) in served bytes',
    ]);
  });
});

describe('formatRouteCounts', () => {
  it('renders the one-line class summary the gate and route check share', () => {
    expect(formatRouteCounts({ served: 1180, redirects: 56, dropped: 19, dead: 14, authGated: 10 })).toBe(
      '1180 served 200 · 56 stub 301 · 19 dropped/test 404 · 14 dead 404 · 10 auth-gated 404',
    );
  });
});
