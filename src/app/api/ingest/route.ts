import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { ingestDocument, INGEST_MAX_CHARS, listDocuments } from "@/lib/zaimem/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "mdx", "csv", "tsv", "log", "json", "yaml", "yml",
  "xml", "html", "htm", "svg", "ini", "cfg", "conf", "env", "sql", "ts", "tsx",
  "js", "jsx", "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cpp",
  "cs", "php", "sh", "bash", "zsh", "toml", "srt", "vtt",
]);

function extOf(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? "";
}

/** Extract plain text from an uploaded file buffer. Throws on unsupported types. */
async function extractText(filename: string, mime: string, buf: Buffer): Promise<string> {
  const ext = extOf(filename);

  if (ext === "pdf" || mime === "application/pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  }

  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }

  if (ext === "doc") {
    throw new Error("legacy .doc is not supported — save as .docx or paste the text");
  }

  if (TEXT_EXTENSIONS.has(ext) || mime.startsWith("text/") || !mime) {
    return buf.toString("utf8");
  }

  throw new Error(`unsupported file type: ${ext || mime || "unknown"} — use PDF, DOCX, TXT, MD, CSV or source code`);
}

/**
 * POST /api/ingest — file ingestion into vector memory.
 *   multipart/form-data: file=<blob>              (dashboard drag & drop)
 *   application/json:    { filename, text }       (agents / API callers)
 * Both paths run the same pipeline: chunk → embed → dedupe-by-hash.
 */
export async function POST(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let filename = "";
    let text = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file field is required" }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: `file too large (${(file.size / 1048576).toFixed(1)} MB — max 10 MB)` }, { status: 400 });
      }
      filename = file.name || "upload.txt";
      const buf = Buffer.from(await file.arrayBuffer());
      text = await extractText(filename, file.type || "", buf);
    } else {
      const body = (await req.json().catch(() => null)) as { filename?: string; text?: string } | null;
      if (!body?.filename || !body?.text?.trim()) {
        return NextResponse.json({ error: "filename and text are required" }, { status: 400 });
      }
      if (body.text.length > INGEST_MAX_CHARS) {
        return NextResponse.json({ error: `text too large: ${body.text.length} chars (max ${INGEST_MAX_CHARS})` }, { status: 400 });
      }
      if (extOf(body.filename) === "doc") {
        throw new Error("legacy .doc is not supported — save as .docx or paste the text");
      }
      filename = body.filename;
      text = body.text;
    }

    const extracted = text.replace(/\u0000/g, "").trim();
    if (!extracted) {
      return NextResponse.json({ error: "no extractable text found (scanned/image PDF?)" }, { status: 400 });
    }

    const r = await ingestDocument({ userId: user.id, filename, text: extracted });
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ingest failed";
    const status = msg.startsWith("unsupported file type") || msg.includes("not supported") ? 415 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

/** GET /api/ingest — list ingested documents with chunk counts. */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const docs = await listDocuments(user.id);
  return NextResponse.json({ documents: docs, totalChunks: docs.reduce((n, d) => n + d.chunks, 0) });
}
