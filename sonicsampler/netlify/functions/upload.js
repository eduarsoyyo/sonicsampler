// Receives base64 audio from browser, uploads to litterbox.catbox.moe
// Returns a public URL valid 72h that Replicate can fetch.
// No API key needed — free public service.

const https = require("https");

const BOUNDARY = "----SonicSamplerBoundary" + Date.now();

function buildMultipart(fileBuffer, filename, mimeType) {
  const header = [
    `--${BOUNDARY}`,
    `Content-Disposition: form-data; name="reqtype"`,
    "",
    "fileupload",
    `--${BOUNDARY}`,
    `Content-Disposition: form-data; name="time"`,
    "",
    "72h",
    `--${BOUNDARY}`,
    `Content-Disposition: form-data; name="fileToUpload"; filename="${filename}"`,
    `Content-Type: ${mimeType}`,
    "",
    "",
  ].join("\r\n");

  const footer = `\r\n--${BOUNDARY}--\r\n`;
  return Buffer.concat([
    Buffer.from(header, "utf8"),
    fileBuffer,
    Buffer.from(footer, "utf8"),
  ]);
}

function postMultipart(body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "litterbox.catbox.moe",
      path: "/resources/internals/api.php",
      method: "POST",
      headers: {
        "Content-Type":   `multipart/form-data; boundary=${BOUNDARY}`,
        "Content-Length": body.length,
        "User-Agent":     "SonicSamplerAI/1.0",
      },
    }, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => resolve({ status: res.statusCode, body: raw.trim() }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: "Bad JSON" }; }

  const { data, mimeType = "audio/mpeg", filename = "audio.mp3" } = body;
  if (!data) return { statusCode: 400, body: JSON.stringify({ error: "data (base64) required" }) };

  // ~20MB base64 limit (~15MB file)
  if (data.length > 28_000_000) {
    return { statusCode: 413, body: JSON.stringify({ error: "Archivo demasiado grande. Máximo ~15MB." }) };
  }

  try {
    const fileBuffer = Buffer.from(data, "base64");
    const multipart  = buildMultipart(fileBuffer, filename, mimeType);
    const result     = await postMultipart(multipart);

    // Litterbox returns the URL directly as plain text on success
    if (result.status === 200 && result.body.startsWith("https://")) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.body }),
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Upload failed: " + result.body }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
