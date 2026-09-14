// Ticket 08: **known-drift acceptance** — the state that lets a steady-state
// run come back empty while the tree stays honestly stale.
//
// The tree is a frozen 2026-09-12 snapshot and upstream has moved on. Some of
// that movement is drift the maintainer has decided not to act on: a prose edit
// on `/careers`, filter-label renames on four pages. Left unaccepted it makes
// every run non-empty, so the alarm is permanently on and stops being read.
// `--accept-drift` records the differences the current run reports as *known*;
// a plain run matches each difference against the recorded set and reports a
// match as accepted — still shown as a count and a page/tier, never silently
// dropped — so it is not a finding and does not set exit 1.
//
// An entry's identity is its tier plus its target (a page path; a media page
// and slot; a restyle asset URL), and its **live fingerprint** is the live
// side's own digest or liveness class. Matching is on identity *and*
// fingerprint, so a recorded difference whose live side changes again no longer
// matches and re-alarms. Identity is deliberately tier- and slot-specific: one
// accepted media slot cannot vouch for another on the same page.
//
// The set is committed in the baseline (spec decision 9) and only
// `--accept-drift` rewrites it; it is replaced, never merged, so a stale entry
// for a page that has since moved cannot linger.
//
// **The blind spot acceptance creates.** A recorded entry is keyed on the live
// side alone. Once a difference is accepted, the run no longer distinguishes
// "served matches live" from "served is known stale", and a change to the
// *served* side that leaves the live bytes alone still matches the entry and
// stays quiet — acceptance answers "has live moved since we looked", not "does
// served still equal live". A restyle entry is additionally only ever compared
// against the baseline asset set it was recorded from, so an accepted restyle
// is cleared by a plain `--accept` (which advances that set), not by
// `--accept-drift`.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * The four tiers acceptance covers. The index/liveness tier is deliberately
 * absent: `--accept-drift` accepts content drift — the differences the per-tier
 * comparisons report — not the page set, which stays a finding until the tree
 * itself moves.
 * @typedef {'copy'|'chrome'|'restyle'|'media'} AcceptTier
 */

/**
 * An accepted per-page copy or chrome difference: the page, and the digest of
 * the live page's projection when it was accepted.
 * @typedef {Object} PageAcceptance
 * @property {'copy'|'chrome'} tier
 * @property {string} path
 * @property {string} fingerprint
 */

/**
 * An accepted restyle difference: the shared asset's URL, and the digest of its
 * live bytes when it was accepted.
 * @typedef {Object} AssetAcceptance
 * @property {'restyle'} tier
 * @property {string} url
 * @property {string} fingerprint
 */

/**
 * An accepted media difference: the page, the slot key, and the slot's live
 * liveness class when it was accepted.
 * @typedef {Object} MediaAcceptance
 * @property {'media'} tier
 * @property {string} path
 * @property {string} slot
 * @property {string} fingerprint
 */

/**
 * One accepted difference as committed in the baseline, and one current run's
 * difference before it is accepted — the two sides of a match carry the same
 * shape, which is what `partitionAccepted` compares.
 * @typedef {PageAcceptance | AssetAcceptance | MediaAcceptance} AcceptanceEntry
 */

/** The committed order of tiers, so the accepted set serializes stably. */
const TIER_ORDER = ['copy', 'chrome', 'restyle', 'media'];

/**
 * A media slot's identity from its page and slot key, so an accepted entry and
 * the finding it matches key the same slot without either re-spelling the
 * separator. Exported because the run filters media findings by the active
 * identities, not only when it builds the committed set.
 * @param {string} path
 * @param {string} slot
 * @returns {string}
 */
export function mediaSlotIdentity(path, slot) {
  return `media\u0000${path}\u0000${slot}`;
}

/**
 * The identity a difference is matched by: its tier plus its target, never its
 * fingerprint. Two differences with the same identity are the same slot of the
 * world; the fingerprint decides whether the live side still matches.
 * @param {AcceptanceEntry} entry
 * @returns {string}
 */
export function acceptanceIdentity(entry) {
  if (entry.tier === 'restyle') return `restyle\u0000${entry.url}`;
  if (entry.tier === 'media') return mediaSlotIdentity(entry.path, entry.slot);
  return `${entry.tier}\u0000${entry.path}`;
}

/**
 * The committed shape of one entry: exactly the identity fields and the
 * fingerprint, so a difference built with extra run-only context cannot leak
 * into the baseline.
 * @param {AcceptanceEntry} entry
 * @returns {AcceptanceEntry}
 */
function normalize(entry) {
  if (entry.tier === 'restyle') return { tier: 'restyle', url: entry.url, fingerprint: entry.fingerprint };
  if (entry.tier === 'media') return { tier: 'media', path: entry.path, slot: entry.slot, fingerprint: entry.fingerprint };
  return { tier: entry.tier, path: entry.path, fingerprint: entry.fingerprint };
}

/**
 * Tier order, then identity, so the committed set is stable across runs and
 * machines.
 * @param {AcceptanceEntry} a
 * @param {AcceptanceEntry} b
 * @returns {number}
 */
function byAcceptance(a, b) {
  const tier = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
  if (tier !== 0) return tier;
  const ka = acceptanceIdentity(a);
  const kb = acceptanceIdentity(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export { byAcceptance };

/**
 * Split this run's differences into the ones a recorded entry vouches for and
 * the ones that are still findings. A difference is accepted only when an entry
 * of the same identity carries the same live fingerprint; an entry with a moved
 * fingerprint leaves the difference active, which is the re-alarm.
 * @param {AcceptanceEntry[]} differences
 * @param {AcceptanceEntry[]} accepted
 * @returns {{accepted: AcceptanceEntry[], active: AcceptanceEntry[]}}
 */
export function partitionAccepted(differences, accepted) {
  const known = new Map(accepted.map((entry) => [acceptanceIdentity(entry), entry]));
  /** @type {AcceptanceEntry[]} */
  const acceptedOut = [];
  /** @type {AcceptanceEntry[]} */
  const active = [];
  for (const difference of differences) {
    const entry = known.get(acceptanceIdentity(difference));
    if (entry !== undefined && entry.fingerprint === difference.fingerprint) acceptedOut.push(difference);
    else active.push(difference);
  }
  return { accepted: acceptedOut, active };
}

/**
 * The committed form of this run's differences: deduped by identity, normalized
 * to the entry shape, and sorted. The set is a replacement, so this is the whole
 * of what `--accept-drift` writes.
 * @param {AcceptanceEntry[]} differences
 * @returns {AcceptanceEntry[]}
 */
export function acceptanceEntries(differences) {
  const byIdentity = new Map();
  for (const difference of differences) byIdentity.set(acceptanceIdentity(difference), normalize(difference));
  return [...byIdentity.values()].sort(byAcceptance);
}
