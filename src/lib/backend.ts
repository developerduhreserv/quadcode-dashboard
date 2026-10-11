import type { DB, Kind, Row } from "./types";
import { emptyDB } from "./seed";

export interface Backend {
  kind: "local" | "supabase";
  /** Все строки рабочего пространства. Пустой массив = хранилище пустое. */
  load(): Promise<Row[]>;
  /** Сохраняет изменённые строки. db = состояние после изменения. */
  save(rows: Row[], db: DB): Promise<void>;
  /** Изменения, пришедшие извне: другая вкладка или другой человек. */
  subscribe(onRows: (rows: Row[]) => void, onReplace: (rows: Row[]) => void): () => void;
}

const KEY: Record<Exclude<Kind, "meta">, Exclude<keyof DB, "meta">> = {
  member: "members",
  channel: "channels",
  target: "targets",
  task: "tasks",
  event: "events",
  doc: "docs",
  expense: "expenses",
  pulse: "pulse",
};

export function applyRows(db: DB, rows: Row[]): DB {
  const next: DB = { ...db };
  const copied = new Set<string>();
  for (const r of rows) {
    if (r.kind === "meta") {
      if (r.data) next.meta = { ...next.meta, ...(r.data as DB["meta"]) };
      continue;
    }
    const key = KEY[r.kind];
    if (!key) continue;
    if (!copied.has(key)) {
      (next[key] as Record<string, unknown>) = { ...(next[key] as Record<string, unknown>) };
      copied.add(key);
    }
    const map = next[key] as Record<string, unknown>;
    if (r.data === null) delete map[r.id];
    else map[r.id] = r.data;
  }
  return next;
}

export function dbToRows(db: DB): Row[] {
  const rows: Row[] = [];
  (Object.keys(KEY) as Exclude<Kind, "meta">[]).forEach((kind) => {
    const map = db[KEY[kind]] as Record<string, unknown>;
    for (const id of Object.keys(map)) rows.push({ kind, id, data: map[id] });
  });
  rows.push({ kind: "meta", id: "meta", data: db.meta });
  return rows;
}

export function rowsToDB(rows: Row[]): DB {
  return applyRows(emptyDB(), rows);
}
