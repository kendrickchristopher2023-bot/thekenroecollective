import { useEffect, useRef, useState } from "react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Mode = "curated" | "search" | "type" | "image";

const CURATED: { group: string; items: string[] }[] = [
  { group: "Starters", items: ["🥗","🍅","🥒","🫒","🧀","🥖","🥯","🧈","🍞","🥨"] },
  { group: "Seafood",  items: ["🦪","🦐","🦞","🦀","🐟","🍣","🍤","🐠","🦑","🐙"] },
  { group: "Mains",    items: ["🥩","🍗","🍖","🍝","🍕","🌮","🌯","🥘","🍛","🥟"] },
  { group: "Veg",      items: ["🌿","🥬","🥦","🌶️","🍆","🌽","🥕","🍄","🥑","🫛"] },
  { group: "Sweets",   items: ["🍰","🧁","🍮","🍦","🍨","🍩","🍪","🍫","🍯","🍓"] },
  { group: "Drinks",   items: ["🍷","🥂","🍸","🍹","🍺","🍶","☕","🍵","🥃","🧉"] },
  { group: "Accents",  items: ["✨","🌙","⭐","🔥","🌹","🌸","💛","🤍","🕯️","🎉"] },
];

type Value = { emoji?: string; iconUrl?: string };

export function CourseIconPicker({
  value, onChange, label = "Icon",
}: { value: Value; onChange: (v: Value) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("curated");
  const [typed, setTyped] = useState(value.emoji ?? "");
  const [uploading, setUploading] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const preview = value.iconUrl
    ? <img src={value.iconUrl} alt="" className="h-6 w-6 rounded object-cover" />
    : <span className="text-lg leading-none">{value.emoji || "＋"}</span>;

  async function handleUpload(file: File) {
    if (file.size > 4 * 1024 * 1024) { toast.error("Image too large (4MB max)"); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Sign in to upload"); return; }
      const path = `${user.id}/designs/course-icons/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g,"_")}`;
      const { error } = await supabase.storage.from("atelier-shared").upload(path, file, { upsert: true });
      if (error) { toast.error(error.message); return; }
      const { data: pub } = supabase.storage.from("atelier-shared").getPublicUrl(path);
      onChange({ iconUrl: pub.publicUrl });
      setOpen(false);
      toast.success("Icon uploaded");
    } finally { setUploading(false); }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={label}
        className="flex h-9 w-12 items-center justify-center rounded border border-ink/15 bg-white hover:border-velvet"
      >
        {preview}
      </button>
      {open && (
        <div ref={popRef} className="absolute z-50 mt-1 w-[320px] rounded-lg border border-ink/10 bg-white p-2 shadow-xl">
          <div className="mb-2 flex gap-1 text-[11px]">
            {(["curated","search","type","image"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`rounded-full px-2 py-0.5 ${mode === m ? "bg-velvet text-white" : "bg-ink/5 hover:bg-ink/10"}`}>
                {m === "curated" ? "Picks" : m === "search" ? "Search" : m === "type" ? "Custom" : "Upload"}
              </button>
            ))}
            {(value.emoji || value.iconUrl) && (
              <button onClick={() => { onChange({}); setTyped(""); }}
                className="ml-auto text-[10px] text-ink/40 hover:text-red-600">Clear</button>
            )}
          </div>

          {mode === "curated" && (
            <div className="max-h-64 overflow-y-auto pr-1">
              {CURATED.map((g) => (
                <div key={g.group} className="mb-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-ink/40">{g.group}</div>
                  <div className="grid grid-cols-10 gap-0.5">
                    {g.items.map((e) => (
                      <button key={e} onClick={() => { onChange({ emoji: e }); setOpen(false); }}
                        className={`rounded p-1 text-lg hover:bg-ink/5 ${value.emoji === e ? "bg-velvet/10" : ""}`}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {mode === "search" && (
            <Picker data={data} onEmojiSelect={(e: any) => { onChange({ emoji: e.native }); setOpen(false); }}
              theme="light" previewPosition="none" skinTonePosition="none" maxFrequentRows={1} perLine={8} />
          )}

          {mode === "type" && (
            <div className="space-y-2">
              <p className="text-[11px] text-ink/50">Type any character(s) — emoji, symbol, or even multiple.</p>
              <input value={typed} onChange={(e) => setTyped(e.target.value.slice(0, 6))}
                placeholder="e.g. 🍷✨ or *"
                className="w-full rounded border border-ink/15 px-2 py-1.5 text-lg" />
              <button onClick={() => { onChange({ emoji: typed }); setOpen(false); }}
                disabled={!typed.trim()}
                className="w-full rounded bg-velvet px-3 py-1.5 text-xs text-white disabled:opacity-50">Use this</button>
            </div>
          )}

          {mode === "image" && (
            <div className="space-y-2">
              <p className="text-[11px] text-ink/50">Upload a small icon, logo, or hand-drawn mark. PNG, JPG, or SVG. 4MB max.</p>
              <input type="file" accept="image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.currentTarget.value = ""; }}
                className="block w-full text-xs" />
              {uploading && <p className="text-[11px] text-ink/40">Uploading…</p>}
              {value.iconUrl && <img src={value.iconUrl} alt="" className="h-16 w-16 rounded border border-ink/10 object-cover" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
