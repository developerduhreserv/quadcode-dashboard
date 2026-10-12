import { draftReply, errorText } from "@/lib/pulse-ai";
import { teamDenied, teamOk } from "@/lib/pulse-server";
import type { PulseItem } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "no-key" }, { status: 501 });
  if (!teamOk(request)) return teamDenied();
  const item = (await request.json().catch(() => null)) as PulseItem | null;
  if (!item || typeof item.text !== "string" || typeof item.url !== "string") return Response.json({ error: "Нет поста" }, { status: 400 });
  try {
    const safe = { ...item, text: item.text.slice(0, 1200), title: item.title?.slice(0, 300), author: String(item.author ?? "").slice(0, 80) };
    return Response.json({ draft: await draftReply(safe) });
  } catch (e) {
    return Response.json({ error: errorText(e) }, { status: 502 });
  }
}
