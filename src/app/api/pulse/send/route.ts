import { replyThreads, teamDenied, teamOk } from "@/lib/pulse-server";

export const maxDuration = 60;

/** Отправка ответа от нашего аккаунта. Сейчас напрямую умеет только Threads, X отвечает через окно ответа. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { network?: string; replyTo?: string; text?: string } | null;
  const text = body?.text?.trim() ?? "";
  if (body?.network !== "threads" || !body.replyTo || !/^\d+$/.test(body.replyTo) || !text) return Response.json({ error: "Нечего отправлять" }, { status: 400 });
  if (text.length > 500) return Response.json({ error: "В Threads не больше 500 символов" }, { status: 400 });
  if (!process.env.THREADS_ACCESS_TOKEN) return Response.json({ error: "no-key" }, { status: 501 });
  if (!teamOk(request)) return teamDenied();
  try {
    return Response.json({ id: await replyThreads(body.replyTo, text) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
