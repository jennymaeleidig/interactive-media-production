# Share kit

The text that travels with the link. Nothing serves this at a path on the
piece's own domain: anything there sits behind a browser warning and is
unreachable by exactly the viewer it is for. It reaches people only as pasted
text, so post it wherever the link goes.

## What this is

An artwork, not Flock Safety. It is a scripted chat that reproduces a real
company's look on a domain that company does not own — that is the point of the
piece, and browsers sometimes flag it for it. Nothing on the page asks you for
anything.

## If you meet a browser warning

The warning is your browser's, not the page's. To get through it:

- **Chrome:** choose **Details**, then **Visit this unsafe site**.
- **Firefox and Zen:** the warning comes from Safe Browsing. In Settings →
  Privacy & Security → Security, turn off "Block dangerous and deceptive
  content"; or set `browser.safebrowsing.phishing.enabled` and
  `browser.safebrowsing.malware.enabled` to `false` in `about:config`.

## If you think the warning is wrong

Google keeps an incorrect-warning report form at
<https://safebrowsing.google.com/safebrowsing/report_error/>. It is open: no
sign-in, no proof of ownership. Server-side unfurls (Slack, Telegram, Signal,
Meta) are not affected by the warning, so the link preview should still read
honestly.

## The link

<https://flocksafety.cam/>

## The canonical honest string

The page's `og:title`, `og:description` and meta description are trimmed from
this one string, declared once in `lib/share.ts`, so the prose here and the
served tags cannot drift:

> An artwork, not Flock Safety. If your browser warns, use Details → proceed in
> Chrome; in Firefox or Zen, turn off deceptive-content blocking.

The first sentence stands alone, so a one-line preview still says the one thing
that matters.
