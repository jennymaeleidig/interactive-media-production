// The engine's session store: raw persistence behind one tiny interface.
//
// The engine owns the conversation; this module owns where its bytes sit. The
// seam exists because persistence is the one thing the engine cannot assume: a
// browser in private mode, or one that has hit its quota, refuses
// `localStorage` — and the conversation must keep working in the page anyway.
// The engine speaks `read`/`write`/`clear` over text and knows nothing about
// `localStorage`; the adapters here decide where that text goes.
//
// SPDX-License-Identifier: CC0-1.0

/**
 * Raw persistence for the one session, as text. The engine does its own JSON
 * parsing and staleness check; a store only moves bytes.
 * @typedef {{
 *   read(): string | null,
 *   write(text: string): void,
 *   clear(): void,
 * }} SessionStore
 */

/**
 * A store backed by the page's `localStorage`. It throws exactly as
 * `localStorage` does — refusing to write in private mode, throwing on read
 * when the origin is denied — so wrap it in `resilientStore` before handing it
 * to the engine.
 * @param {string} key
 * @returns {SessionStore}
 */
export function localStorageStore(key) {
  return {
    read: () => window.localStorage.getItem(key),
    write: (text) => window.localStorage.setItem(key, text),
    clear: () => window.localStorage.removeItem(key),
  };
}

/**
 * A store that holds the text in page memory and never throws. It is the
 * private-mode fallback: the conversation works for the visit, it just cannot
 * survive a reload.
 * @returns {SessionStore}
 */
export function memoryStore() {
  /** @type {string | null} */
  let held = null;
  return {
    read: () => held,
    write: (text) => {
      held = text;
    },
    clear: () => {
      held = null;
    },
  };
}

/**
 * A store that writes through to `backing` but never throws: every write also
 * lands in `copy`, and reads fall back to `copy` once `backing` has refused.
 * This is the whole private-mode story in one place — when `localStorage`
 * rejects a write (private mode, a full quota) the in-page copy is the
 * session, and when it accepts one again the backing store is trusted once
 * more.
 * @param {SessionStore} backing
 * @param {SessionStore} [copy]
 * @returns {SessionStore}
 */
export function resilientStore(backing, copy = memoryStore()) {
  let usable = true;
  return {
    read() {
      if (usable) {
        try {
          return backing.read();
        } catch {
          usable = false;
        }
      }
      return copy.read();
    },
    write(text) {
      copy.write(text);
      try {
        backing.write(text);
        usable = true;
      } catch {
        usable = false;
      }
    },
    clear() {
      copy.clear();
      try {
        backing.clear();
        usable = true;
      } catch {
        usable = false;
      }
    },
  };
}
