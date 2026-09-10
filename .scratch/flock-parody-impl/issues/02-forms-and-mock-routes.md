# 02: Forms & mock routes

**What to build:** Every served form behaves like the original without ever sending data anywhere. Form markup stays identical to the Capture; the build injects a POST action pointing at a local mock route keyed per form. The mock route swallows the submission and redirects to the captured thank-you page. Marketo forms render fully styled from the Capture's own stylesheets, with no authored mock CSS.

**Blocked by:** 01.

**Status:** open
Label: ready-for-agent

- [ ] A served main-flow form preserves the captured markup exactly.
- [ ] Submitting it POSTs to the local mock route, which returns a redirect to the captured thank-you page.
- [ ] No submission leaves the machine; no external endpoint is contacted.
- [ ] Marketo forms render fully styled exactly as captured.
- [ ] Hidden clones and the scheduler embed remain inert.
- [ ] Form routing is logged per page by the build.
