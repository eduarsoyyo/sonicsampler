// Receives a base64-encoded audio file from the browser,
// uploads it to the Replicate Files API, and returns a hosted URL
// that can be passed to the separation model.

const https = require("https");

const TOKEN = process.env.REPLICATE_API_TOKEN;

function replicateUpload(buffer, mimeType, filename) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.replicate.com",
      path: "/v1/files",
      method: "POST",
      headers: {
        "Authorization":       `Token ${TOKEN}`,
        "Content-Type":        mimeType,
        "Content-Length":      buffer.length,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    }, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { reject(new Error("Bad JSON from Replicate: " + raw.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  if (!TOKEN) return { statusCode: 500, body: JSON.stringify({ error: "REPLICATE_API_TOKEN not set" }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: "Bad JSON" }; }

  const { data, mimeType = "audio/mpeg", filename = "audio.mp3" } = body;
  if (!data) return { statusCode: 400, body: JSON.stringify({ error: "data (base64) required" }) };

  // Size check — warn if over 20MB base64 (~15MB file)
  if (data.length > 28_000_000) {
    return {
      statusCode: 413,
      body: JSON.stringify({ error: "Archivo demasiado grande. Máximo ~15MB. Usa un fragmento más corto." }),
    };
  }

  try {
    const buffer = Buffer.from(data, "base64");
    const result = await replicateUpload(buffer, mimeType, filename);

    if (result.status !== 201) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Replicate upload failed", detail: result.data }),
      };
    }

    // Replicate Files API returns { urls: { get: "https://..." }, id, ... }
    const fileUrl = result.data.urls?.get || result.data.url;
    if (!fileUrl) {
      return { statusCode: 500, body: JSON.stringify({ error: "No URL in Replicate response", detail: result.data }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: fileUrl, id: result.data.id }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
