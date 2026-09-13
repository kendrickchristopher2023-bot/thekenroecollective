import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Image as ImageIcon,
  Smile,
  Sparkles,
  Link as LinkIcon,
  Heading,
  Quote,
  X,
} from "lucide-react";
import { GiphyPicker } from "@/components/giphy-picker";

// Curated emoji palette — quick insert without depending on the OS picker.
const EMOJI_PALETTE = [
  "✨", "🎉", "🚀", "🔥", "🌟", "💫", "🎊", "🥂",
  "💡", "✅", "🆕", "🛠️", "🐛", "⚡", "📣", "💬",
  "❤️", "🙌", "👏", "👀", "🎁", "📅", "📨", "📸",
  "💎", "🌸", "🪄", "🎨", "🍾", "☕", "🌿", "🦋",
];

// Very small sanitizer — strip <script>/<style>, on* attributes, javascript: URLs.
function sanitizeHtml(input: string): string {
  if (!input) return "";
  let html = input;
  // Remove script/style blocks
  html = html.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  // Remove on* event handler attributes
  html = html.replace(/\son[a-z]+\s*=\s*"(?:[^"]*)"/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*'(?:[^']*)'/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // Neutralize javascript: URLs
  html = html.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"');
  html = html.replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'");
  return html;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your update… use the toolbar to format, drop in emoji, GIFs, or images.",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGiphy, setShowGiphy] = useState(false);
  const [showImg, setShowImg] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [imgUrl, setImgUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const lastSelection = useRef<Range | null>(null);

  // Initialise content once.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      lastSelection.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    if (lastSelection.current) {
      sel.addRange(lastSelection.current);
    } else if (ref.current) {
      // Place caret at end
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      sel.addRange(range);
    }
  };

  const emit = useCallback(() => {
    if (!ref.current) return;
    onChange(sanitizeHtml(ref.current.innerHTML));
  }, [onChange]);

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    restoreSelection();
    document.execCommand(command, false, arg);
    emit();
  };

  const insertHtml = (html: string) => {
    ref.current?.focus();
    restoreSelection();
    document.execCommand("insertHTML", false, sanitizeHtml(html));
    emit();
  };

  const insertEmoji = (e: string) => {
    insertHtml(e);
    setShowEmoji(false);
  };

  const insertImageFromUrl = () => {
    const url = imgUrl.trim();
    if (!url) return;
    insertHtml(
      `<img src="${url.replace(/"/g, "&quot;")}" alt="" style="max-width:100%;border-radius:12px;margin:8px 0;" />`,
    );
    setImgUrl("");
    setShowImg(false);
  };

  const insertGif = (url: string | undefined) => {
    if (!url) return;
    insertHtml(
      `<img src="${url.replace(/"/g, "&quot;")}" alt="GIF" style="max-width:320px;border-radius:12px;margin:8px 0;" />`,
    );
    setShowGiphy(false);
  };

  const insertLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    const safe = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
    exec("createLink", safe);
    setLinkUrl("");
    setShowLink(false);
  };

  return (
    <div className="rounded-xl border border-ink/15 bg-paper">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-ink/10 p-2">
        <ToolBtn title="Bold" onClick={() => exec("bold")}><Bold className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Italic" onClick={() => exec("italic")}><Italic className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Underline" onClick={() => exec("underline")}><Underline className="h-3.5 w-3.5" /></ToolBtn>
        <Divider />
        <ToolBtn title="Heading" onClick={() => exec("formatBlock", "<h3>")}><Heading className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Quote" onClick={() => exec("formatBlock", "<blockquote>")}><Quote className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Bullet list" onClick={() => exec("insertUnorderedList")}><List className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Numbered list" onClick={() => exec("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>
        <Divider />
        <ToolBtn title="Link" onClick={() => { saveSelection(); setShowLink((v) => !v); }}><LinkIcon className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Emoji" onClick={() => { saveSelection(); setShowEmoji((v) => !v); }}><Smile className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="GIF" onClick={() => { saveSelection(); setShowGiphy((v) => !v); }}><Sparkles className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Image from URL" onClick={() => { saveSelection(); setShowImg((v) => !v); }}><ImageIcon className="h-3.5 w-3.5" /></ToolBtn>
      </div>

      {/* Inline popovers */}
      {showLink && (
        <PopoverBar onClose={() => setShowLink(false)}>
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            className="flex-1 rounded border border-ink/15 px-2 py-1 text-xs"
            autoFocus
          />
          <button onClick={insertLink} className="rounded-full bg-velvet px-3 py-1 text-[11px] text-white">Insert</button>
        </PopoverBar>
      )}
      {showImg && (
        <PopoverBar onClose={() => setShowImg(false)}>
          <input
            value={imgUrl}
            onChange={(e) => setImgUrl(e.target.value)}
            placeholder="https://…/image.png"
            className="flex-1 rounded border border-ink/15 px-2 py-1 text-xs"
            autoFocus
          />
          <button onClick={insertImageFromUrl} className="rounded-full bg-velvet px-3 py-1 text-[11px] text-white">Insert</button>
        </PopoverBar>
      )}
      {showEmoji && (
        <div className="border-b border-ink/10 p-2">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Insert emoji</span>
            <button onClick={() => setShowEmoji(false)}><X className="h-3 w-3" /></button>
          </div>
          <div className="grid grid-cols-12 gap-1 text-xl">
            {EMOJI_PALETTE.map((e) => (
              <button
                key={e}
                onClick={() => insertEmoji(e)}
                className="rounded p-1 hover:bg-secondary"
                title={e}
              >{e}</button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Tip: your keyboard's emoji picker also works (Win+. or Ctrl+Cmd+Space).</p>
        </div>
      )}
      {showGiphy && (
        <div className="max-h-[400px] overflow-auto border-b border-ink/10 p-3">
          <div className="flex items-center justify-between pb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Pick a GIF</span>
            <button onClick={() => setShowGiphy(false)}><X className="h-3 w-3" /></button>
          </div>
          <GiphyPicker onChange={(url) => insertGif(url)} />
        </div>
      )}

      {/* Editable area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={() => { saveSelection(); emit(); }}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        data-placeholder={placeholder}
        className="rte-content min-h-[180px] max-h-[480px] overflow-auto p-4 text-sm leading-relaxed focus:outline-none"
      />
      <style>{`
        .rte-content:empty::before {
          content: attr(data-placeholder);
          color: rgb(115 115 115 / 0.7);
          pointer-events: none;
        }
        .rte-content p { margin: 0 0 0.6em; }
        .rte-content h3 { font-size: 1.05rem; font-weight: 600; margin: 0.5em 0 0.3em; }
        .rte-content ul { list-style: disc; padding-left: 1.25rem; margin: 0 0 0.6em; }
        .rte-content ol { list-style: decimal; padding-left: 1.25rem; margin: 0 0 0.6em; }
        .rte-content blockquote { border-left: 3px solid rgb(0 0 0 / 0.15); padding-left: 0.75rem; color: rgb(0 0 0 / 0.65); margin: 0.5em 0; font-style: italic; }
        .rte-content a { color: #7c2d6b; text-decoration: underline; }
        .rte-content img { max-width: 100%; border-radius: 12px; margin: 8px 0; }
      `}</style>
    </div>
  );
}

function ToolBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="rounded p-1.5 text-ink/70 hover:bg-secondary hover:text-ink"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-ink/10" />;
}

function PopoverBar({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-ink/10 bg-secondary/30 p-2">
      {children}
      <button onClick={onClose}><X className="h-3 w-3 text-muted-foreground" /></button>
    </div>
  );
}

export { sanitizeHtml };
