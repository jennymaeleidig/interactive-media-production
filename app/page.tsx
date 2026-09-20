// The host page: the canvas the chat stands on, and nothing else.
//
// It carries one sentence, so the page says something with JavaScript off, and
// then the chat — whose launcher is the piece's interface. Nothing here
// reproduces a site, and the widget arrives with its own stylesheet and
// typeface, so there is no styling to inherit from.
//
// SPDX-License-Identifier: CC0-1.0
export default function Home() {
  return (
    <main>
      <p>This page hosts a chat assistant. Enable JavaScript to talk to it.</p>
    </main>
  );
}
