"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorList, useUserName } from "@/components/crm/ui";
import { FileLink, PhotoPicker, PhotoThumbs } from "@/components/files/Files";
import { useToast } from "@/components/Providers";
import { Button, Card } from "@/components/ui/fields";
import { useAuth } from "@/lib/auth/AuthProvider";
import { uploadFile, type PhotoRef } from "@/lib/files";
import { formatDate } from "@/lib/format";
import { projectRepo } from "@/lib/projects";
import { EVENT_TYPES, MONEY_EVENT_TYPES } from "@/lib/projects/config";
import { useEvents, useProjectMutation } from "@/lib/projects/hooks";
import { onTeam, todayIso } from "@/lib/projects/rules";
import type { EventType, NewNote, Project, ProjectEvent } from "@/lib/projects/types";
import { useList } from "@/lib/settings/hooks";

/** Filter groups shown to users (Progress covers progress updates plus task and stage events). */
const TYPE_FILTERS: { value: string; label: string; types: EventType[] }[] = [
  { value: "", label: "All", types: [] },
  { value: "note", label: "Notes", types: ["note"] },
  { value: "progress", label: "Progress", types: ["progress", "task", "stage"] },
  { value: "detail", label: "Details", types: ["detail"] },
  { value: "payment", label: "Payments", types: ["payment"] },
  { value: "expense", label: "Expenses", types: ["expense"] },
  { value: "attendance", label: "Attendance", types: ["attendance"] },
];

const isImage = (f: PhotoRef) => f.type.startsWith("image/");
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

function NoteComposer({ project }: { project: Project }) {
  const toast = useToast();
  const { user } = useAuth();
  const userName = useUserName();
  const tags = useList("noteTags");
  const [text, setText] = useState("");
  const [tag, setTag] = useState("general");
  const [mentions, setMentions] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [files, setFiles] = useState<PhotoRef[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [today] = useState(() => todayIso());
  const add = useProjectMutation((n: NewNote) => projectRepo.addNote(project.id, n));
  const team = [...new Set([project.projectManagerId, ...project.team.map((m) => m.employeeId)])].filter((id) => id !== user?.id && onTeam(project, id, today));
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="note-composer">
      <textarea
        aria-label="Add a note"
        placeholder="Add a note for the team…"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select aria-label="Note tag" value={tag} onChange={(e) => setTag(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {tags.items.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Mention a team member"
          value=""
          onChange={(e) => e.target.value && setMentions((m) => [...new Set([...m, e.target.value])])}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">@ Mention…</option>
          {team.map((id) => (
            <option key={id} value={id}>
              {userName(id)}
            </option>
          ))}
        </select>
        {mentions.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            @{userName(id)}
            <button type="button" aria-label={`Remove mention of ${userName(id)}`} onClick={() => setMentions((m) => m.filter((x) => x !== id))}>
              ✕
            </button>
          </span>
        ))}
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          aria-label="Attach files to note"
          onChange={async (e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = "";
            for (const f of list) {
              try {
                const m = await uploadFile(f);
                setFiles((x) => [...x, { fileId: m.id, name: m.name, type: m.type, size: m.size, takenAt: m.takenAt, uploadedAt: m.createdAt }]);
              } catch (err) {
                toast(err instanceof Error ? err.message : String(err), "error");
              }
            }
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
          📎 File
        </Button>
      </div>
      <div className="mt-2">
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </div>
      {files.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {files.map((f) => (
            <li key={f.fileId} className="flex items-center gap-2">
              📎 <FileLink file={f} />
              <button type="button" className="text-xs text-slate-400 hover:text-red-700" onClick={() => setFiles((x) => x.filter((y) => y.fileId !== f.fileId))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ErrorList issues={issues} />
      <div className="mt-2 flex justify-end">
        <Button
          variant="primary"
          size="sm"
          disabled={add.isPending}
          onClick={() =>
            add.mutate(
              { text, tag, mentions, files: [...photos, ...files] },
              {
                onSuccess: () => {
                  setText("");
                  setTag("general");
                  setMentions([]);
                  setPhotos([]);
                  setFiles([]);
                  setIssues([]);
                  toast("Note added");
                },
                onError: (e) => setIssues([e.message]),
              },
            )
          }
        >
          Add note
        </Button>
      </div>
    </div>
  );
}

function Entry({ e, project }: { e: ProjectEvent; project: Project }) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const userName = useUserName();
  const tags = useList("noteTags");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(e.text);
  const [tag, setTag] = useState(e.tag);
  const edit = useProjectMutation(() => projectRepo.editNote(project.id, e.id, text, tag));
  const del = useProjectMutation(() => projectRepo.deleteNote(project.id, e.id));
  const icon = EVENT_TYPES.find((t) => t.value === e.type)?.icon ?? "•";
  const own = e.type === "note" && e.by === user?.id;
  const canDelete = e.type === "note" && (own || user?.role === "admin");
  const s = e.source;
  const target =
    s && (s.kind === "task" || s.kind === "update" || s.kind === "stage")
      ? `/projects/${project.id}/progress?stage=${s.stageKey ?? ""}${s.kind === "task" ? `&task=${s.id}` : ""}`
      : s?.kind === "expense"
        ? `/projects/${project.id}/expenses?open=${s.id}`
        : s && (s.kind === "payment" || s.kind === "variation" || (s.kind === "section" && s.id === "money"))
        ? "#money"
        : s?.kind === "section"
          ? `#${s.id}`
          : null;
  const go = () => {
    if (!target) return;
    if (target.startsWith("#")) document.getElementById(target.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    else router.push(target);
  };
  const photos = e.files.filter(isImage);
  const others = e.files.filter((f) => !isImage(f));

  return (
    <li className="flex gap-3 py-2.5" data-testid="timeline-entry" data-type={e.type}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{userName(e.by)}</span>
          <span>{timeOf(e.at)}</span>
          {e.tag && e.type === "note" ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">{tags.label(e.tag)}</span> : null}
          {e.editedAt ? <span className="italic">edited</span> : null}
        </div>
        {editing ? (
          <div className="mt-1 space-y-2">
            <textarea aria-label="Edit note" value={text} onChange={(ev) => setText(ev.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <div className="flex gap-2">
              <select aria-label="Edit tag" value={tag} onChange={(ev) => setTag(ev.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                {tags.items.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="primary" onClick={() => edit.mutate(undefined, { onSuccess: () => setEditing(false), onError: (er) => toast(er.message, "error") })}>
                Save
              </Button>
              <Button size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={`mt-0.5 whitespace-pre-line text-sm text-slate-800 ${target ? "cursor-pointer hover:text-red-800" : ""}`}
            onClick={go}
            role={target ? "link" : undefined}
          >
            {e.text}
            {e.mentions.length ? <span className="ml-1 text-sky-700">{e.mentions.map((m) => `@${userName(m)}`).join(" ")}</span> : null}
          </p>
        )}
        {photos.length ? (
          <div className="mt-1.5">
            <PhotoThumbs photos={photos} />
          </div>
        ) : null}
        {others.map((f) => (
          <div key={f.fileId} className="mt-1 text-sm">
            📎 <FileLink file={f} />
          </div>
        ))}
        {(own || canDelete) && !editing ? (
          <div className="mt-1 flex gap-3 text-xs">
            {own ? (
              <button type="button" className="text-slate-500 hover:text-slate-900" onClick={() => setEditing(true)}>
                Edit
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                className="text-slate-500 hover:text-red-700"
                onClick={() => window.confirm("Delete this note?") && del.mutate(undefined, { onError: (er) => toast(er.message, "error") })}
              >
                Delete
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** F. Timeline and notes: every automatic entry plus notes, newest first, grouped by day. */
export function Timeline({ project }: { project: Project }) {
  const { user } = useAuth();
  const userName = useUserName();
  const tags = useList("noteTags");
  const isAdmin = user?.role === "admin";
  const [type, setType] = useState("");
  const [tag, setTag] = useState("");
  const [by, setBy] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const types = TYPE_FILTERS.find((t) => t.value === type)!.types;
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useEvents(project.id, { types, tag, by, from, to });
  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const groups = useMemo(() => {
    const map = new Map<string, ProjectEvent[]>();
    for (const e of items) {
      const d = todayIso(new Date(e.at).getTime());
      map.set(d, [...(map.get(d) ?? []), e]);
    }
    return [...map.entries()];
  }, [items]);
  const people = useMemo(() => [...new Set([project.projectManagerId, ...project.team.map((m) => m.employeeId)])], [project]);
  const sentinel = useRef<HTMLDivElement>(null);

  // Load older entries automatically when the end of the list scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && !isFetchingNextPage && void fetchNextPage(), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const [[today, yesterday]] = useState(() => [todayIso(), todayIso(Date.now() - 86_400_000)]);
  const dayLabel = (d: string) => (d === today ? "Today" : d === yesterday ? "Yesterday" : formatDate(d));
  const sel = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs";

  return (
    <Card title="F. Timeline and notes">
      <div id="timeline" />
      <NoteComposer project={project} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select aria-label="Filter timeline by type" value={type} onChange={(e) => setType(e.target.value)} className={sel}>
          {TYPE_FILTERS.filter((t) => isAdmin || !t.types.some((x) => MONEY_EVENT_TYPES.includes(x))).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter timeline by tag" value={tag} onChange={(e) => setTag(e.target.value)} className={sel}>
          <option value="">Any tag</option>
          {tags.items.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter timeline by person" value={by} onChange={(e) => setBy(e.target.value)} className={sel}>
          <option value="">Anyone</option>
          {people.map((id) => (
            <option key={id} value={id}>
              {userName(id)}
            </option>
          ))}
          <option value="system">System</option>
        </select>
        <input type="date" aria-label="Timeline from" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} />
        <input type="date" aria-label="Timeline to" value={to} onChange={(e) => setTo(e.target.value)} className={sel} />
      </div>
      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !items.length ? (
        <p className="text-sm text-slate-500">Nothing here yet.</p>
      ) : (
        <div className="space-y-3">
          {groups.map(([day, list]) => (
            <section key={day}>
              <h4 className="sticky top-0 z-10 bg-white py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{dayLabel(day)}</h4>
              <ul className="divide-y divide-slate-100">
                {list.map((e) => (
                  <Entry key={e.id} e={e} project={project} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div ref={sentinel} />
      {hasNextPage ? (
        <div className="mt-3 text-center">
          <Button size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? "Loading…" : "Load older entries"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
