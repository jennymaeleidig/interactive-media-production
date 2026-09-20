/*
 * Flock's mark — the tree from the wordmark, on its own so the transcript can
 * carry it beside the assistant's bubbles without a second copy of the
 * geometry. Inline SVG, like the wordmark, so the page requests no image.
 *
 * The mark is a trademark of Flock Group Inc, used here as part of a
 * knowingly-recorded reproduction (docs/adr/0001-reproduce-flock-brand-identity.md,
 * docs/adr/0002-accept-impersonation-risk.md); no rights are claimed, which is
 * why this file carries no license stamp.
 */
export function MarkPaths() {
  return (
    <>
      <path
        d="M11.9052 0L13.1453 31.5153H5.62402L6.11916 22.6519C6.15714 21.9636 5.94817 21.2855 5.52602 20.7407L0 13.5967L2.48484 9.51073L5.49834 12.7327C5.91612 13.1808 6.66542 12.9069 6.69904 12.2948L7.38704 0H11.9052Z"
        fill="currentColor"
      />
      <path
        d="M21.048 5.52274C21.048 8.59091 18.5691 11.0806 15.5206 11.0807H13.7354V9.28518C13.7354 6.21701 16.2143 3.72729 19.2629 3.72726H21.048V5.52274Z"
        fill="currentColor"
      />
    </>
  );
}

/** The mark alone, sized by its caller. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 21.048 31.5153"
      xmlns="http://www.w3.org/2000/svg"
    >
      <MarkPaths />
    </svg>
  );
}
