import { buildDigest, errorText } from "@/lib/pulse-ai";
import { teamDenied, teamOk } from "@/lib/pulse-server";
import type { DigestInput } from "@/lib/pulse-ai";

// Сводка с веб-поиском идёт до пары минут
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "no-key" }, { status: 501 });
  if (!teamOk(request)) return teamDenied();
  const body = (await request.json().catch(() => null)) as Partial<DigestInput> | null;
  const input: DigestInput = {
    items: Array.isArray(body?.items) ? body.items.slice(0, 80) : [],
    ours: Array.isArray(body?.ours) ? body.ours.slice(0, 30) : [],
    releases: Array.isArray(body?.releases) ? body.releases.slice(0, 10) : [],
  };
  try {
    return Response.json(await buildDigest(input));
  } catch (e) {
    return Response.json({ error: errorText(e) }, { status: 502 });
  }
}
