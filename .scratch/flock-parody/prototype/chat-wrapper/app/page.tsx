import ChatWidget from "@/components/ChatWidget";

// PROTOTYPE host page (ticket 04) — a fake marketing page, tall enough to
// scroll (the pounce is scroll-triggered, like the original).
export default function Page() {
  return (
    <main>
      <div className="proto-banner">
        <strong>PROTOTYPE — wayfinder ticket 04: chat wrapper binding</strong>
        Question this artifact answers: how does the cloned Qualified chat
        widget bind to yarnspinner-ts? Scroll to trigger the pounce, click the
        CTAs, type freely, reload the page (session must survive). The
        top-right panel exposes the server-side session state.
      </div>
      <section className="proto-section">
        <h1>Safer. Together.</h1>
        <p>
          Host-page stub. Nothing here is the piece — it only exists so the
          widget has somewhere to pounce from.
        </p>
      </section>
      <div className="proto-fill" />
      <div className="proto-fill" />
      <div className="proto-fill" />
    </main>
  );
}
