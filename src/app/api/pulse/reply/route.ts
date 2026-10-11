import { draftReply, errorText } from "@/lib/pulse-ai";
import type { PulseItem } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "no-key" }, { status: 501 });
  const item = (await request.json().catch(() => null)) as PulseItem | null;
  if (!item || typeof item.text !== "string" || typeof item.url !== "string") return Response.json({ error: "Нет поста" }, { status: 400 });
  try {
    return Response.json({ draft: await draftReply({ ...item, text: item.text.slice(0, 1200) }) });
  } catch (e) {
    return Response.json({ error: errorText(e) }, { status: 502 });
  }
}
