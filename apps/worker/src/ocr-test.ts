import { Hono } from "hono";
import { createClient } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { OcrService } from "@parley/proto";

/**
 * Bindings shared with the parent worker.
 * The sub-app inherits the parent's binding type through Hono route mounting.
 */
type Bindings = {
  ENGINE_SERVICE_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// In-memory image store for uploaded files.
// Keyed by UUID, maps to raw bytes + content type.
// Dev/test only — for production, use R2 or another object store.
const imageStore = new Map<string, { data: Uint8Array; mime: string }>();

// Serve an uploaded image so the engine-service can download it via the
// image_url field. The engine-service HTTP client fetches from this URL.
app.get("/file/:id", (c) => {
  const entry = imageStore.get(c.req.param("id"));
  if (!entry) {
    return c.text("Not Found", 404);
  }
  return new Response(entry.data, {
    status: 200,
    headers: { "Content-Type": entry.mime },
  });
});

app.get("/", (c) => {
  return c.html(OCR_FORM_HTML);
});

app.post("/", async (c) => {
  const formData = await c.req.formData();

  const guildId = (formData.get("guild_id") as string) || "";
  const userId = (formData.get("user_id") as string) || "";
  let imageUrl = (formData.get("image_url") as string) || "";
  const file = formData.get("image") as File | null;

  if (!imageUrl && file) {
    const id = crypto.randomUUID();
    const buffer = await file.arrayBuffer();
    imageStore.set(id, {
      data: new Uint8Array(buffer) as Uint8Array<ArrayBuffer>,
      mime: file.type || "image/png",
    });
    // The worker serves files at /ocr/file/:id; the engine-service
    // (localhost:50051) can reach the worker (localhost:8787) in local dev.
    imageUrl = `${new URL(c.req.url).origin}/ocr/file/${id}`;
  }

  if (!imageUrl) {
    return c.html(
      `<p style="color:red;font-family:system-ui">Error: provide an image URL or upload a file.</p><a href="/ocr">Back</a>`,
      400,
    );
  }

  const transport = createConnectTransport({
    baseUrl: c.env.ENGINE_SERVICE_URL,
    jsonOptions: { enumAsInteger: true },
    fetch(input, init) {
      const { redirect: _redirect, ...rest } = init ?? {};
      return globalThis.fetch(input, { ...rest, redirect: "follow" });
    },
  });

  try {
    const client = createClient(OcrService, transport);
    const result = await client.scanScreenshot({
      imageUrl,
      guildId,
      userId,
      requestId: crypto.randomUUID(),
    });

    return c.html(resultPage(result));
  } catch (err) {
    const message = err instanceof ConnectError ? err.message : String(err);
    const status = err instanceof ConnectError && err.code === Code.NotFound ? 404 : 502;
    return c.html(errorPage(message), status as 404 | 502);
  }
});

export default app;

const OCR_FORM_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OCR Screenshot Scanner</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 520px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; }
    h1 { font-size: 1.4rem; margin-bottom: 8px; }
    p.sub { color: #666; font-size: 0.875rem; margin-top: 0; }
    fieldset { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; }
    legend { font-weight: 600; font-size: 0.875rem; color: #374151; }
    label { display: block; margin: 10px 0 4px; font-size: 0.8125rem; color: #6b7280; font-weight: 500; }
    input[type="text"], input[type="url"] { width: 100%; padding: 8px 10px; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.9375rem; }
    input[type="file"] { width: 100%; padding: 6px 0; font-size: 0.875rem; }
    input::placeholder { color: #9ca3af; }
    button { width: 100%; padding: 10px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 12px; }
    button:hover { background: #1d4ed8; }
    .divider { text-align: center; color: #9ca3af; margin: 8px 0; font-size: 0.8125rem; }
  </style>
</head>
<body>
  <h1>OCR Screenshot Scanner</h1>
  <p class="sub">Parse a Rainbow Six Siege scoreboard screenshot into structured match data.</p>
  <form method="POST" enctype="multipart/form-data">
    <fieldset>
      <legend>Image</legend>
      <label for="image">Upload screenshot</label>
      <input type="file" id="image" name="image" accept="image/*">
      <div class="divider">or</div>
      <label for="image_url">Public image URL (e.g. Discord CDN)</label>
      <input type="url" id="image_url" name="image_url" placeholder="https://cdn.discordapp.com/attachments/...">
    </fieldset>
    <fieldset>
      <legend>Metadata (optional)</legend>
      <label for="guild_id">Guild ID</label>
      <input type="text" id="guild_id" name="guild_id" placeholder="123456789">
      <label for="user_id">User ID</label>
      <input type="text" id="user_id" name="user_id" placeholder="987654321">
    </fieldset>
    <button type="submit">Scan Screenshot</button>
  </form>
</body>
</html>`;

function resultPage(result: unknown): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OCR Scan Result</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; }
    h1 { font-size: 1.4rem; }
    pre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 0.8125rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    a { color: #2563eb; font-weight: 500; }
    .success { color: #16a34a; font-weight: 600; }
    .fail { color: #dc2626; font-weight: 600; }
  </style>
</head>
<body>
  <h1>OCR Scan Result</h1>
  <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>
  <p><a href="/ocr">Scan another</a></p>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OCR Error</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; }
    h1 { font-size: 1.4rem; color: #dc2626; }
    pre { background: #fef2f2; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 0.875rem; color: #991b1b; white-space: pre-wrap; word-break: break-word; }
    a { color: #2563eb; font-weight: 500; }
  </style>
</head>
<body>
  <h1>OCR Error</h1>
  <pre>${escapeHtml(message)}</pre>
  <p><a href="/ocr">Back</a></p>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
