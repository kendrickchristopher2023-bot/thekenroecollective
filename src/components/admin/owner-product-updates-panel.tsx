import { toUserMessage } from "@/lib/user-error";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Save, Send, Archive } from "lucide-react";
import {
  deleteProductUpdate,
  listProductUpdatesAdmin,
  upsertProductUpdate,
} from "@/lib/product-updates.functions";
import { RichTextEditor } from "@/components/rich-text-editor";
import { confirmDialog } from "@/lib/confirm-dialog";
import { formatStampDate } from "@/lib/datetime";

type Audience = "all" | "whisper" | "host" | "atelier";
type Status = "draft" | "published" | "archived";

type Update = {
  id: string;
  title: string;
  emoji: string | null;
  body_html: string;
  cover_image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  audience_tier: Audience;
  status: Status;
  published_at: string | null;
  created_at: string;
};

const blank = (): Partial<Update> => ({
  title: "",
  emoji: "✨",
  body_html: "",
  cover_image_url: "",
  cta_label: "",
  cta_url: "",
  audience_tier: "all",
  status: "draft",
});

export function OwnerProductUpdatesPanel() {
  const list = useServerFn(listProductUpdatesAdmin);
  const save = useServerFn(upsertProductUpdate);
  const del = useServerFn(deleteProductUpdate);

  const [items, setItems] = useState<Update[]>([]);
  const [draft, setDraft] = useState<Partial<Update>>(blank());
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const editing = !!draft.id;

  const load = async () => setItems(((await list()) as Update[]) ?? []);
  useEffect(() => {
    load();
  }, []);

  const newOne = () => {
    setDraft(blank());
    setPreview(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const editOne = (u: Update) => {
    setDraft({ ...u });
    setPreview(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const persist = async (status: Status) => {
    if (!draft.title?.trim()) {
      toast.error("Add a title first");
      return;
    }
    setBusy(true);
    try {
      await save({
        data: {
          id: draft.id,
          title: draft.title.trim(),
          emoji: draft.emoji?.trim() || null,
          body_html: draft.body_html ?? "",
          cover_image_url: draft.cover_image_url?.trim() || null,
          cta_label: draft.cta_label?.trim() || null,
          cta_url: draft.cta_url?.trim() || null,
          audience_tier: (draft.audience_tier as Audience) ?? "all",
          status,
        },
      });
      toast.success(
        status === "published"
          ? "Published — customers will see it"
          : status === "archived"
          ? "Archived"
          : "Saved as draft",
      );
      newOne();
      load();
    } catch (e) {
      toast.error(toUserMessage(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: "Delete this update? This cannot be undone." }))) return;
    try {
      await del({ data: { id } });
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(toUserMessage(e, "Delete failed"));
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl">Product updates</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Announce new features, fixes, and changes to your customers. They'll see a "What's new" bell in the app without interrupting their current page.
          </p>
        </div>
        {editing && (
          <button onClick={newOne} className="rounded-full bg-secondary px-3 py-1.5 text-xs">
            <Plus className="mr-1 inline h-3 w-3" /> New update
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-[80px_1fr_180px]">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Icon</label>
            <input
              value={draft.emoji ?? ""}
              onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
              maxLength={4}
              placeholder="✨"
              className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-center text-xl"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Title</label>
            <input
              value={draft.title ?? ""}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. New seating chart builder"
              className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Audience</label>
            <select
              value={draft.audience_tier ?? "all"}
              onChange={(e) => setDraft({ ...draft, audience_tier: e.target.value as Audience })}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
            >
              <option value="all">Everyone</option>
              <option value="whisper">Whisper only</option>
              <option value="host">Host only</option>
              <option value="atelier">Atelier only</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Cover image URL (optional)</label>
          <input
            value={draft.cover_image_url ?? ""}
            onChange={(e) => setDraft({ ...draft, cover_image_url: e.target.value })}
            placeholder="https://…  (or use a GIF/image inside the body)"
            className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Body</label>
          <div className="mt-1">
            <RichTextEditor
              value={draft.body_html ?? ""}
              onChange={(html) => setDraft((d) => ({ ...d, body_html: html }))}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Button label (optional)</label>
            <input
              value={draft.cta_label ?? ""}
              onChange={(e) => setDraft({ ...draft, cta_label: e.target.value })}
              placeholder="e.g. Try it out"
              className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Button URL</label>
            <input
              value={draft.cta_url ?? ""}
              onChange={(e) => setDraft({ ...draft, cta_url: e.target.value })}
              placeholder="https://…"
              className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPreview((v) => !v)}
            className="rounded-full bg-secondary px-3 py-1.5 text-xs"
          >
            <Eye className="mr-1 inline h-3 w-3" /> {preview ? "Hide preview" : "Preview"}
          </button>
          <span className="flex-1" />
          <button
            onClick={() => persist("draft")}
            disabled={busy}
            className="rounded-full bg-secondary px-4 py-1.5 text-xs disabled:opacity-50"
          >
            <Save className="mr-1 inline h-3 w-3" /> Save draft
          </button>
          <button
            onClick={() => persist("published")}
            disabled={busy}
            className="rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            <Send className="mr-1 inline h-3 w-3" /> {editing && draft.status === "published" ? "Update" : "Publish"}
          </button>
          {editing && draft.status !== "archived" && (
            <button
              onClick={() => persist("archived")}
              disabled={busy}
              className="rounded-full bg-secondary px-3 py-1.5 text-xs"
            >
              <Archive className="mr-1 inline h-3 w-3" /> Archive
            </button>
          )}
        </div>

        {preview && (
          <div className="mt-2 rounded-2xl bg-paper p-5 ring-1 ring-ink/10">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer preview</div>
            <UpdatePreview draft={draft} />
          </div>
        )}
      </div>

      {/* List */}
      <div className="rounded-2xl bg-card ring-1 ring-ink/5">
        <div className="border-b border-ink/5 px-5 py-3 text-sm font-medium">All updates ({items.length})</div>
        <ul className="divide-y divide-ink/5">
          {items.length === 0 && (
            <li className="px-5 py-8 text-center text-xs text-muted-foreground">
              No updates yet. Compose your first announcement above and publish it.
            </li>
          )}
          {items.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-5 py-3">
              <div className="text-xl">{u.emoji || "📣"}</div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium">{u.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {u.status} · {u.audience_tier === "all" ? "Everyone" : u.audience_tier} ·{" "}
                  {u.published_at ? formatStampDate((u.published_at)) : "—"}
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                  u.status === "published"
                    ? "bg-emerald-100 text-emerald-800"
                    : u.status === "archived"
                    ? "bg-secondary text-muted-foreground"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {u.status}
              </span>
              <button onClick={() => editOne(u)} className="rounded-full bg-secondary px-3 py-1 text-[11px]">
                Edit
              </button>
              <button
                onClick={() => remove(u.id)}
                className="rounded-full bg-red-600/90 px-2.5 py-1 text-white"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function UpdatePreview({ draft }: { draft: Partial<Update> }) {
  return (
    <div className="space-y-3">
      {draft.cover_image_url && (
        <img
          src={draft.cover_image_url}
          alt={draft.title ? `${draft.title} cover` : "Update cover image"}
          className="w-full rounded-xl object-cover max-h-64"
        />
      )}
      <div className="flex items-center gap-2">
        <span className="text-2xl">{draft.emoji || "📣"}</span>
        <h3 className="font-serif text-xl">{draft.title || "Untitled update"}</h3>
      </div>
      <div
        className="rte-content text-sm"
        dangerouslySetInnerHTML={{ __html: draft.body_html || "<p class='text-muted-foreground'>No content yet.</p>" }}
      />
      {draft.cta_label && draft.cta_url && (
        <a
          href={draft.cta_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white"
        >
          {draft.cta_label}
        </a>
      )}
    </div>
  );
}
