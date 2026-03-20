const https = require("https");
const http  = require("http");
const { URL } = require("url");

const ALLOWED = ["replicate.delivery","pbxt.cdn.replicate.delivery","storage.googleapis.com","litter.catbox.moe"];

exports.handler = async (event) => {
  const targetUrl = (event.queryStringParameters || {}).url;
  if (!targetUrl) return { statusCode: 400, body: "missing url" };
  let parsed;
  try { parsed = new URL(targetUrl); } catch { return { statusCode: 400, body: "invalid url" }; }
  const allowed = ALLOWED.some(h => parsed.hostname === h || parsed.hostname.endsWith("." + h));
  if (!allowed) return { statusCode: 403, body: "URL not allowed" };
  const lib = parsed.protocol === "https:" ? https : http;
  return new Promise(resolve => {
    lib.get(targetUrl, { timeout: 30000 }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({
          statusCode: 200,
          headers: { "Content-Type": res.headers["content-type"] || "audio/mpeg", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400" },
          body: buf.toString("base64"),
          isBase64Encoded: true,
        });
      });
    }).on("error", err => resolve({ statusCode: 502, body: err.message }))
      .on("timeout", function() { this.destroy(); resolve({ statusCode: 504, body: "timeout" }); });
  });
};
