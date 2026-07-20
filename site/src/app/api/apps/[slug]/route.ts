import { NextRequest, NextResponse } from "next/server";
import { loadCatalog } from "@/lib/catalog";

export const revalidate = 300;

/** GET /api/apps/{slug} — the full listing (manifest + artifact). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const catalog = await loadCatalog();
  const listing = catalog.find((entry) => entry.slug === slug);
  if (!listing) {
    return NextResponse.json({ detail: `App '${slug}' not found` }, { status: 404 });
  }
  return NextResponse.json(listing);
}
