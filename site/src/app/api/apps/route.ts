import { NextRequest, NextResponse } from "next/server";
import { loadCatalog, summarize } from "@/lib/catalog";

export const revalidate = 300;

/** GET /api/apps?q=…&type=static|platform|service — catalog summaries. */
export async function GET(request: NextRequest) {
  const catalog = await loadCatalog();
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const type = request.nextUrl.searchParams.get("type");

  let apps = catalog.map(summarize);
  if (type) apps = apps.filter((app) => app.type === type);
  if (q) {
    apps = apps.filter((app) =>
      [app.name, app.slug, app.description, ...(app.tags ?? []), ...app.capabilities]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }
  return NextResponse.json({ total: apps.length, apps });
}
