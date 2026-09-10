# 08: Chat engine & conversation core

**What to build:** A working conversation behind a small server API, powered by the Yarn runtime with no live backend. The Yarn project compiles once when the server starts; each session holds its own dialogue in server memory so conversations survive page reloads. One POST per turn sends a start, resume, or option selection and receives the turn's lines, the pending choice set, or completion, plus the session's variables. Starting is idempotent. The script ships as a minimal fixture with the pinned copy; the demo branch ends at the email gate with a single "Maybe later" choice that returns to the hub, and the gate never dead-ends. A minimal widget exists to drive it.

**Blocked by:** 01.

**Status:** resolved
Label: ready-for-agent

- [x] Starting a session yields the pinned greeting.
- [x] Selecting a choice advances the conversation and yields the next lines or choice set.
- [x] A live session resumes instead of resetting when started again.
- [x] Conversations persist across page reloads via server-side session state.
- [x] Variables are surfaced with every turn.
- [x] The demo branch asks for an email, then offers only "Maybe later", which returns to the hub option set.
- [x] No rendered UI marks the divergence, and no request leaves the machine.
- [x] The chat engine is testable behind its message API without a browser.
