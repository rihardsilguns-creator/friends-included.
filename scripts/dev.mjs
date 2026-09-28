import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import handler from "../api/index.js";

process.env.DATA_MODE ||= "memory";
process.env.NODE_ENV ||= "development";
const root = new URL("../public/", import.meta.url).pathname.slice(1);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) return handler(req, res);
  try {
    const path = req.url === "/" ? "index.html" : req.url.split("?")[0].replace(/^\//, "");
    const data = await readFile(join(root, path));
    res.setHeader("content-type", mime[extname(path)] || "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
server.listen(process.env.PORT || 3000, () => console.log(`Friends Included running at http://localhost:${process.env.PORT || 3000}`));
