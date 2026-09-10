# 09: Chat widget fidelity

**What to build:** The mimic looks exactly like the original assistant. The three surfaces — launcher, pounce card, expanded panel — match the captured geometry and styling, with the widget's CSS lifted wholesale from the Capture and no authored replacements. The composer box and send icon are visually present but inert; pending choices render as user-style chips inside the composer slot, with a placeholder when none are pending. Replies land as complete bubbles — no typing indicator, no sounds. The pounce behavior and panel geometry match the captured contract.

**Blocked by:** 08.

**Status:** open
Label: ready-for-agent

- [ ] The launcher, pounce card, and expanded panel match the captured dimensions, placement, and colors.
- [ ] Widget styling comes from the Capture's stylesheet, with zero authored styling additions.
- [ ] The composer is visually present and inert; the placeholder shows when no chips are pending.
- [ ] Choices render as user-style chips inside the composer slot and selecting one reads as a sent message.
- [ ] Replies appear as complete bubbles with no typing indicator and no sounds.
- [ ] The pounce fires per the captured trigger behavior.
- [ ] A side-by-side against the captured widget shows no visible divergence.
