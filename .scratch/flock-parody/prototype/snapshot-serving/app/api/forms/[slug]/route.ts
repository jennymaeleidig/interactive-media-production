// PROTOTYPE (wayfinder ticket 05) — mock form endpoint.
// Swallows the POST (never leaves the machine — the forms decision) and 303s to
// the captured thank-you page. Slug→target table here mirrors the build pass's
// FORM_INJECTIONS; at build scale the spec will keep one source of truth.
const REDIRECTS: Record<string, string> = {
  'book-a-demo': '/thank-you',
};

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const to = REDIRECTS[slug];
  if (!to) return new Response('Unknown form', { status: 404 });
  await req.formData().catch(() => null); // swallow — the submission goes nowhere
  return new Response(null, { status: 303, headers: { location: to } });
}
