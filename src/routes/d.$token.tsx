import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicDesign, type DesignAssetRow } from "@/lib/design-studio.functions";
import { getTemplate } from "@/lib/design-templates";
import { DesignSvg, exportSvgElementToPdf, exportSvgElementToPng } from "@/lib/design-render";
import { LoadErrorState } from "@/components/load-error-state";
import { SkeletonPanel } from "@/components/skeletons";

export const Route = createFileRoute("/d/$token")({
  head: ({ params }) => ({
    meta: [
      { title: "Shared design — The Kenroe Collective" },
      { name: "description", content: "A shared design from The Kenroe Collective Design Studio." },
      { property: "og:title", content: "Shared design" },
      { property: "og:url", content: `https://thekenroecollective.com/d/${params.token}` },
    ],
  }),
  component: PublicDesign,
});

function PublicDesign() {
  const { token } = useParams({ from: "/d/$token" });
  const [design, setDesign] = useState<DesignAssetRow | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const fetchFn = useServerFn(getPublicDesign);
  useEffect(() => {
    setDesign(undefined);
    setFailed(false);
    // A malformed link can never resolve, so it is a bad link, not a bad connection.
    if (token.trim().length < 8) {
      setDesign(null);
      return;
    }
    fetchFn({ data: { token } })
      .then(({ design }) => setDesign(design))
      // A dropped request is not the same as a design that was taken down.
      .catch(() => setFailed(true));
  }, [token, fetchFn, attempt]);

  if (failed)
    return (
      <div className="grid min-h-[70vh] place-items-center px-6">
        <LoadErrorState
          title="We couldn't load this design"
          description="Check your connection and try again."
          onRetry={() => setAttempt((n) => n + 1)}
          back={{ label: "Go to the home page", to: "/" }}
        />
      </div>
    );
  if (design === undefined)
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <SkeletonPanel />
      </div>
    );
  if (!design)
    return (
      <Center>
        This design is no longer shared. Ask whoever sent the link to share it again.
        <br />
        <Link to="/" className="text-velvet underline">Back home</Link>
      </Center>
    );
  const template = getTemplate(design.template_id);
  if (!template) return <Center>Unknown template.</Center>;

  async function pdf() { const svg = svgWrapRef.current?.querySelector("svg") as SVGSVGElement | null; if (svg) await exportSvgElementToPdf(svg, design!.title); }
  async function png() {
    const svg = svgWrapRef.current?.querySelector("svg") as SVGSVGElement | null; if (!svg) return;
    const blob = await exportSvgElementToPng(svg, 2);
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${design!.title}.png`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/5 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-serif text-lg italic">The Kenroe Collective</Link>
          <div className="flex gap-2">
            <button onClick={pdf} className="rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white">Export PDF</button>
            <button onClick={png} className="rounded-full border border-ink/20 px-4 py-1.5 text-xs font-medium">PNG</button>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-1 font-serif text-2xl italic">{design.title}</h1>
        <p className="mb-6 text-xs text-ink/50">Shared via The Kenroe Collective Design Studio</p>
        <div ref={svgWrapRef} className="rounded-lg border border-ink/10 bg-white p-6 shadow-sm">
          <DesignSvg template={template} content={design.content ?? {}} />
        </div>
      </section>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-paper px-6 text-center text-sm text-ink/60">{children}</div>;
}
