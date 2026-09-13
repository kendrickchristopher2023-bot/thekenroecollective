/**
 * Turns the framework's internal server-function id into a short, readable name
 * for the error monitor.
 *
 * Two id shapes exist, which is why the first attempt at this produced
 * base64 gibberish for half the log:
 *
 *  - built output:  src_lib_rfq_functions_ts--createRfq_createServerFn_handler
 *  - dev output:    base64url of {"file":"/src/lib/rfq.functions.ts?...",
 *                                 "export":"createRfq_createServerFn_handler"}
 *
 * Both become `rfq.createRfq`, which fits the 60-character `source` column with
 * the useful part intact.
 */
function decodeIfEncoded(id: string): string {
  if (id.includes("--") || id.includes("/")) return id;
  if (!/^[A-Za-z0-9_-]{24,}$/.test(id)) return id;
  try {
    const pad = "=".repeat((4 - (id.length % 4)) % 4);
    const json = atob(id.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const parsed = JSON.parse(json) as { file?: string; export?: string };
    if (!parsed.file && !parsed.export) return id;
    return `${parsed.file ?? ""}--${parsed.export ?? ""}`;
  } catch {
    return id;
  }
}

function moduleName(part: string): string {
  return part
    .split("?")[0]!
    .replace(/^\/+/, "")
    .replace(/^src[/_]/, "")
    .replace(/^(lib|routes|components|integrations)[/_]/, "")
    .replace(/[/_](functions|server)\.tsx?$/, "")
    .replace(/_(functions|server)_tsx?$/, "")
    .replace(/\.(functions|server)\.tsx?$/, "")
    .replace(/\.tsx?$/, "")
    .replace(/_tsx?$/, "")
    .replace(/\//g, ".");
}

export function shortServerFnName(raw: string | null | undefined): string {
  const id = decodeIfEncoded((raw ?? "").trim());
  if (!id) return "unknown";

  const [modulePartRaw, fnPartRaw] = id.includes("--") ? id.split("--") : ["", id];

  const fn =
    (fnPartRaw ?? "")
      .replace(/_createServerFn_handler$/, "")
      .replace(/_handler$/, "") || "fn";

  const mod = moduleName(modulePartRaw ?? "");
  const name = mod ? `${mod}.${fn}` : fn;
  return name.length > 50 ? name.slice(name.length - 50) : name;
}
