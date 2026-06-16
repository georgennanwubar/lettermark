/**
 * /api/preview — Server-side renders an EmailDocument to HTML for editor iframes.
 *
 * Auth-gated. Body: { document: EmailDocument, preheader?: string }.
 * Response: text/html.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/session";
import { renderEmail } from "@/lib/email/render";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.document) return NextResponse.json({ error: "missing document" }, { status: 400 });

  // Apply a preheader override if the editor's settings tab set one. The
  // document carries its own preheader on root.attrs.preheader but the
  // settings tab keeps the authoritative copy.
  if (typeof body.preheader === "string") {
    body.document.root.attrs = { ...body.document.root.attrs, preheader: body.preheader };
  }

  try {
    const { html, errors } = await renderEmail(body.document);
    if (errors && errors.length) {
      console.warn("preview render warnings", errors);
    }
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "render failed" }, { status: 500 });
  }
}
