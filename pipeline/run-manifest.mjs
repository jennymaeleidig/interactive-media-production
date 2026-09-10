// The capture run's uncaptured manifest → route classes. The run's
// `manifest-uncaptured.csv` records every discovered path the capture pass
// intentionally did NOT capture: legacy redirect stubs, dead collection
// roots, and auth-gated stubs (spec, "Serving and links"). The build turns
// the redirect rows into `served/redirects.json`; the route classes 404
// everything else, reproducing the live site's observed behavior.
//
// Pure: CSV text in → route classes out. No filesystem, no network.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * One CSV line → fields. Honors double-quoted fields with doubled-quote
 * escapes (`"a,b"` → `a,b`); these manifests are small and flat, so a full
 * RFC parser would be more surface than the data justifies.
 * @param {string} line
 * @returns {string[]}
 */
function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * @typedef {Object} UncapturedManifest
 * @property {Record<string, string>} redirects  legacy stub path → local redirect target
 * @property {string[]} dead  dead collection roots (live site 404s them)
 * @property {string[]} authGated  auth-gated stubs (no recreation in scope)
 * @property {string[]} invalidRedirects  redirect rows whose target is not a safe local path (build warning)
 */

/**
 * A redirect target is local iff it is a root-relative, non-protocol-relative
 * path. Anything else would leave the machine (zero-outbound invariant). One
 * predicate, shared by the build (which writes the table) and the serving
 * layer (which reads it) so the rule cannot drift between them.
 * @param {unknown} target
 * @returns {target is string}
 */
export function isLocalTarget(target) {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//');
}

/**
 * Parse the run's uncaptured manifest.
 * @param {string} csv
 * @returns {UncapturedManifest}
 */
export function parseUncapturedManifest(csv) {
  const lines = csv.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  /** @type {UncapturedManifest} */
  const out = { redirects: {}, dead: [], authGated: [], invalidRedirects: [] };
  if (lines.length === 0) return out;
  const cols = parseCsvLine(lines[0]).map((c) => c.trim());
  const col = (name) => cols.indexOf(name);
  const [iPath, iType, iTarget] = [col('path'), col('type'), col('redirect_target')];
  if (iPath < 0 || iType < 0) return out;
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const p = fields[iPath];
    const type = fields[iType];
    if (!p) continue;
    if (type === 'redirect') {
      const target = iTarget >= 0 ? fields[iTarget] : '';
      // only a local Recreation route is a redirect; anything else would
      // leave the machine and is surfaced, not silently dropped
      if (isLocalTarget(target)) out.redirects[p] = target;
      else out.invalidRedirects.push(`${p} → ${target || '(empty)'}`);
    } else if (type === 'dead') {
      out.dead.push(p);
    } else if (type === 'auth-gated') {
      out.authGated.push(p);
    }
  }
  return out;
}
