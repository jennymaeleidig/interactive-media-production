// The privacy page, in the piece's own plain voice.
//
// The path stays `/legal/privacy-policy` and it stays short, but the framing
// changes: a conventional policy would be close to a contradiction for a piece
// that collects nothing, so this page states what is *not* collected as part of
// the work (ticket 04). The facts survive; the voice stops pretending to be
// corporate legal copy.
//
// SPDX-License-Identifier: CC0-1.0
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-content">
      <h1 className="text-2xl">Privacy</h1>
      <p className="mt-4">
        This is an artwork, not Flock Safety. It keeps nothing about you, so there is very little to
        explain.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>No form, no text field, and nothing to submit.</li>
        <li>No analytics, no trackers, no cookies, and no advertising identifier.</li>
        <li>No account, no email, and no way to contact you.</li>
        <li>The page loads no fonts, images or frames from anyone else.</li>
      </ul>
      <p className="mt-4">
        The only thing this browser stores is where you are in the scripted conversation, in this
        site&rsquo;s own local storage, so a reload picks up where you left off. Clearing this
        site&rsquo;s data removes it. Nothing is sent anywhere, and nothing about you leaves the
        page.
      </p>
    </main>
  );
}
