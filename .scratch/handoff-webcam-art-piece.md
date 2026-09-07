# Handoff: Webcam Access for Local Art Piece

## Context

Q&A conversation (no code written yet, no repo). User is building an **art piece** that uses the webcam **locally only** (preview, nothing sent anywhere). Reference article: https://austingil.com/html-capture-attribute/ (the `capture` attribute — ruled out: file-return only, no live stream, mobile-only).

## Conclusions reached

1. **Live stream (`getUserMedia`) cannot bypass the permission prompt** — it's browser chrome, outside the page DOM; can't be styled, hidden, or auto-clicked. No API flag exists.
2. **Prompt can be eliminated outside the website**:
   - Pre-allow origin in browser settings (`chrome://settings/content/camera`, Firefox `about:preferences#privacy`, Edge/Brave equivalents)
   - Chromium-only launch flags: `chrome --kiosk http://localhost:8000 --use-fake-ui-for-media-stream` (best for installation machines; Firefox/Safari have no equivalent)
   - `localhost` grants persist after first Allow in Chrome
   - macOS also needs System Settings → Privacy & Security → Camera for the browser app (once)
3. **Gating progression is possible in-page**: `getUserMedia()` promise rejects on denial → never proceed. Handle `NotAllowedError` (denied — Chrome/Edge/Brave block permanently, never re-prompt), `NotFoundError`, `NotReadableError`, `SecurityError`. Use `navigator.permissions.query({name:'camera'})` to detect state ('granted'/'denied'/'prompt') up front.
4. **Cross-browser notes**: denial persistence varies (Chromium permanent; Firefox session-level by default; Safari per-site via Safari Settings → Websites → Camera). UX pattern for uncontrolled viewers: designed splash screen ("allow camera to enter") that calls `getUserMedia()` on tap.
5. **Secure context requirement**: works on `http://localhost` / `127.0.0.1` only. Plain HTTP over LAN IP (e.g. phone via `http://192.168.x.x`) is blocked in all browsers — needs HTTPS (mkcert, `npx serve --ssl`, or ngrok tunnel).

## Likely next steps

- Write the actual page: splash → `getUserMedia()` gate → experience, with the try/catch gating pattern discussed (code sketches are in the conversation summary above).
- Possibly a kiosk launch script for the installation machine.

## Suggested skills

- **prototype** — if building a throwaway page to sanity-check the splash/gating flow
- **tdd** — if building the page test-first
- **pi-sandbox** — if serving files locally hits network/filesystem denials

## Notes

- macOS temp dir used: `/tmp/handoff-webcam-art-piece.md`
- No sensitive info involved.

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { margin: 0; background: #000; color: #fff; font-family: sans-serif; }
    #splash, #blocked { position: fixed; inset: 0; display: grid; place-items: center;
                        text-align: center; cursor: pointer; }
    video { width: 100vw; height: 100vh; object-fit: cover; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div id="splash">touch anywhere to begin</div>
  <div id="blocked" class="hidden">
    this piece needs to see you — allow the camera in the address bar, then reload
  </div>
  <video id="cam" class="hidden" autoplay playsinline muted></video>

  <script>
    const splash = document.getElementById('splash');
    const blocked = document.getElementById('blocked');
    const video = document.getElementById('cam');

    async function enter() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.classList.remove('hidden');
      } catch (err) {
        splash.classList.add('hidden');
        blocked.classList.remove('hidden');
      }
    }

    splash.addEventListener('click', enter);
    if (location.protocol === 'file:') {
      splash.textContent = 'serve this over http://localhost (e.g. python3 -m http.server)';
    }
  </script>
</body>
</html>
