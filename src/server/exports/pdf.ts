export interface PdfMargin {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

export interface PdfOptions {
  html: string;
  format?: "A4" | "Letter" | "Legal" | "A3" | "A5" | string;
  margin?: PdfMargin;
  landscape?: boolean;
  scale?: number;
  print_background?: boolean;
}

export interface PdfEnv {
  CLAWNIFY_TOKEN?: string;
  PDF_RENDERER_URL?: string;
  BROWSER?: unknown;
}

export class PdfRenderError extends Error {
  constructor(
    public readonly code: "no_backend" | "invalid_token" | "quota_exceeded" | "render_failed" | "rate_limited" | "upstream",
    message: string,
    public readonly status?: number,
    public readonly detail?: unknown,
  ) {
    super(message);
  }
}

export async function renderPDF(env: PdfEnv, opts: PdfOptions): Promise<Uint8Array> {
  if (env.CLAWNIFY_TOKEN) return viaClawnify(env.CLAWNIFY_TOKEN, opts);
  if (env.PDF_RENDERER_URL) return viaGotenberg(env.PDF_RENDERER_URL, opts);
  if (env.BROWSER) {
    throw new PdfRenderError(
      "no_backend",
      "Direct Browser binding path not implemented yet — install @cloudflare/puppeteer or use CLAWNIFY_TOKEN / PDF_RENDERER_URL.",
    );
  }
  throw new PdfRenderError(
    "no_backend",
    "No PDF renderer configured. Set CLAWNIFY_TOKEN (Clawnify-managed), PDF_RENDERER_URL (Gotenberg sidecar), or wire a BROWSER binding.",
  );
}

async function viaClawnify(token: string, opts: PdfOptions): Promise<Uint8Array> {
  const res = await fetch("https://services.clawnify.com/pdf/render", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      html: opts.html,
      format: opts.format ?? "A4",
      margin: opts.margin,
      landscape: opts.landscape,
      scale: opts.scale,
      print_background: opts.print_background ?? true,
    }),
  });
  if (!res.ok) {
    const body = await safeJson(res);
    throw new PdfRenderError(mapStatusCode(res.status), `services.clawnify.com responded ${res.status}`, res.status, body);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function viaGotenberg(baseUrl: string, opts: PdfOptions): Promise<Uint8Array> {
  const form = new FormData();
  form.append("files", new Blob([opts.html], { type: "text/html" }), "index.html");
  if (opts.format) form.append("paperWidth", "");
  if (opts.margin?.top) form.append("marginTop", mmToInches(opts.margin.top));
  if (opts.margin?.right) form.append("marginRight", mmToInches(opts.margin.right));
  if (opts.margin?.bottom) form.append("marginBottom", mmToInches(opts.margin.bottom));
  if (opts.margin?.left) form.append("marginLeft", mmToInches(opts.margin.left));
  if (opts.landscape !== undefined) form.append("landscape", String(opts.landscape));
  if (opts.scale !== undefined) form.append("scale", String(opts.scale));
  if (opts.print_background !== undefined) form.append("printBackground", String(opts.print_background));

  const url = baseUrl.replace(/\/+$/, "") + "/forms/chromium/convert/html";
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PdfRenderError("upstream", `Gotenberg responded ${res.status}`, res.status, text);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function mapStatusCode(status: number): PdfRenderError["code"] {
  if (status === 401) return "invalid_token";
  if (status === 403) return "quota_exceeded";
  if (status === 422) return "render_failed";
  if (status === 429) return "rate_limited";
  return "upstream";
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json(); }
  catch { return await res.text().catch(() => null); }
}

function mmToInches(value: string): string {
  const m = value.match(/^([\d.]+)\s*(mm|cm|in|px)?$/);
  if (!m) return "0.4";
  const n = parseFloat(m[1]);
  const unit = m[2] || "mm";
  if (unit === "in") return String(n);
  if (unit === "cm") return String(n / 2.54);
  if (unit === "px") return String(n / 96);
  return String(n / 25.4);
}
