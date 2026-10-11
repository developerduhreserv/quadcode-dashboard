"use client";

import { Download, FileText, FileUp, Plus, Table2, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button, Empty, IconButton, Modal, PageHead, Panel, cx, fieldClass } from "@/components/ui";
import { relativeTime } from "@/lib/analytics";
import { download } from "@/lib/exporter";
import { useNow } from "@/lib/hooks";
import { DOC_LIMIT, deleteDoc, saveDoc, updateDoc, useApp } from "@/lib/store";
import type { Doc } from "@/lib/types";

const ACCEPT = ".md,.markdown,.txt,.csv,.tsv,.json,text/plain,text/markdown,text/csv,application/json";
const EXT: Record<Doc["format"], string> = { md: "md", csv: "csv", txt: "txt" };
const MIME: Record<Doc["format"], string> = { md: "text/markdown", csv: "text/csv", txt: "text/plain" };

const formatOf = (name: string): Doc["format"] =>
  /\.(csv|tsv)$/i.test(name) ? "csv" : /\.(md|markdown)$/i.test(name) ? "md" : "txt";

const kb = (s: string) => {
  const n = new Blob([s]).size;
  return n < 1024 ? `${n} Б` : n < 1024 * 1024 ? `${Math.round(n / 1024)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function DocsPage() {
  const { db } = useApp();
  const now = useNow();
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const docs = useMemo(() => Object.values(db.docs).sort((a, b) => b.updatedAt - a.updatedAt), [db.docs]);

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    const skipped: string[] = [];
    let added = 0;
    for (const f of list) {
      if (/\.(xlsx?|docx?|pdf)$/i.test(f.name)) {
        skipped.push(`${f.name}: сохраните как CSV, TXT или MD`);
        continue;
      }
      if (f.size > DOC_LIMIT) {
        skipped.push(`${f.name}: больше 900 КБ`);
        continue;
      }
      saveDoc({ title: f.name.replace(/\.[^.]+$/, ""), body: await f.text(), format: formatOf(f.name) });
      added++;
    }
    setNotice([added ? `Загружено: ${added}.` : "", skipped.length ? `Пропущено: ${skipped.join("; ")}.` : ""].filter(Boolean).join(" "));
  };

  const allDocs = () => {
    const parts = docs.map((d) => `# ${d.title}\n\n${d.format === "csv" ? "```csv\n" + d.body + "\n```" : d.body}`);
    download(`quadcode-документы-${today()}.md`, parts.join("\n\n---\n\n"), "text/markdown");
  };

  return (
    <div className="stagger space-y-4">
      <PageHead
        title="Правила"
        right={
          <>
          <Button onClick={allDocs} disabled={!docs.length}>
            <Download size={15} />
            Скачать всё
          </Button>
          <Button onClick={() => setOpenId(saveDoc({ title: "Новый документ", body: "", format: "md" }))}>
            <Plus size={15} />
            Новый
          </Button>
          <Button variant="primary" onClick={() => file.current?.click()}>
            <FileUp size={15} />
            Загрузить
          </Button>
          <input
            ref={file}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const fs = e.target.files;
              if (fs?.length) upload(fs);
              e.target.value = "";
            }}
          />
          </>
        }
      />

      {notice && (
        <div role="status" className="rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-[14px] text-ink-2">
          {notice}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
        }}
        className={cx("rounded-[22px] transition-shadow", drag && "shadow-[0_0_0_2px_var(--accent)]")}
      >
        <Panel title={`Документы: ${docs.length}`}>
          {docs.length === 0 ? (
            <Empty title="Документов пока нет" />
          ) : (
            <ul className="-mx-2 divide-y divide-line">
              {docs.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(d.id)}
                    className="group flex w-full items-center gap-3.5 rounded-xl px-2 py-3 text-left transition-colors duration-200 hover:bg-white/[0.04]"
                  >
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-accent">
                      {d.format === "csv" ? <Table2 size={17} /> : <FileText size={17} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] text-ink">{d.title}</span>
                      <span className="block text-[12.5px] text-muted">
                        {d.format.toUpperCase()} · {kb(d.body)} · {relativeTime(d.updatedAt, now)}
                        {d.createdBy && db.members[d.createdBy] ? ` · ${db.members[d.createdBy].name}` : d.id.startsWith("report-") ? " · автоматически" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <DocEditor docId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function DocEditor({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const { db } = useApp();
  const doc = docId ? db.docs[docId] : undefined;
  if (!doc) return null;
  return (
    <Modal open onClose={onClose} title="Документ" wide>
      <div className="space-y-3">
        <input
          key={`${doc.id}:title`}
          defaultValue={doc.title}
          aria-label="Название"
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title && title !== doc.title) updateDoc(doc.id, { title });
          }}
          className={cx(fieldClass, "font-display text-[17px] font-medium")}
        />
        <textarea
          key={`${doc.id}:body:${doc.updatedAt}`}
          defaultValue={doc.body}
          rows={16}
          aria-label="Текст"
          placeholder="Текст документа. Поддерживается Markdown."
          onBlur={(e) => {
            if (e.target.value !== doc.body) updateDoc(doc.id, { body: e.target.value });
          }}
          className={cx(fieldClass, "resize-y font-mono text-[13px] leading-relaxed")}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-[12.5px] text-muted">Сохраняется само, когда вы уходите из поля.</span>
          <div className="flex gap-2">
            <IconButton
              label="Удалить документ"
              className="text-crit hover:bg-crit/10 hover:text-crit"
              onClick={() => {
                deleteDoc(doc.id);
                onClose();
              }}
            >
              <Trash2 size={15} />
            </IconButton>
            <Button
              variant="primary"
              onClick={() => download(`${doc.title.replace(/[\\/:*?"<>|]+/g, "-")}.${EXT[doc.format]}`, doc.body, MIME[doc.format])}
            >
              <Download size={15} />
              Скачать .{EXT[doc.format]}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
