// Class-name joiner for the shell's components. New code is CC0-1.0.
//
// The vendored template used `clsx` + `tailwind-merge`; the shell's class lists
// are authored here and never overridden by callers, so the two dependencies buy
// nothing and a plain join is the whole contract.
//
// SPDX-License-Identifier: CC0-1.0
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
