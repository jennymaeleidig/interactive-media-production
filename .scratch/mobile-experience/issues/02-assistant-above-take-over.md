# Assistant rides above the nav take-over

Type: task
Status: open
Blocked by: 01

## Question

The Plume AI Sales Assistant and the nav take-over would both naturally claim the top layer (the widget is `fixed z-50`). The standing decision: the assistant is **always on top** — the nav take-over opens beneath it and never covers the bubble or panel.

- Establish explicit z-index ordering between header/take-over and `AssistantWidget.svelte` (token or documented values, not bare magic numbers scattered in components).
- Verify on a phone-shaped viewport: with the take-over open, the widget bubble stays visible and clickable, and the open assistant panel still sits above the take-over.

Resolved when the layering is explicit in code and verified as above.
