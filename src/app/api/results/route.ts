import { NextRequest } from "next/server";
import { fetchArchivePage } from "@/lib/convex-server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = await fetchArchivePage({
    query: searchParams.get("q") ?? undefined,
    categoryId: searchParams.get("category") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    cursor: searchParams.get("cursor"),
    numItems: Number(searchParams.get("limit") ?? 25),
    createdAfter: from ? Date.parse(`${from}T00:00:00.000Z`) : undefined,
    createdBefore: to ? Date.parse(`${to}T23:59:59.999Z`) : undefined,
  });
  return Response.json(page);
}
