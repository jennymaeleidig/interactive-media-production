// The privacy page the widget's footer links to.
//
// The widget's bytes are not edited, and one of them pins this path
// (`/legal/privacy-policy`), so the host serves it rather than rewriting the
// widget. It is short because there is nothing to disclose: the conversation
// runs in the browser, the piece names no network primitive, and the only thing
// it stores is the session the visitor can clear by clearing site data.
//
// SPDX-License-Identifier: CC0-1.0
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPolicy() {
  return (
    <main>
      <h1>Privacy</h1>
      <p>
        This page hosts a chat assistant. The conversation runs entirely in your browser: this site has no server to send it
        to, and the page loads nothing from anyone else.
      </p>
      <p>
        The only thing kept is where you are in the conversation, stored in this browser&rsquo;s own local storage so a
        reload can pick it up again. Clearing this site&rsquo;s data removes it. Nothing is collected, and nothing is sent
        anywhere.
      </p>
    </main>
  );
}
