// Serves a production build for the offline test: files as they are, anything else falls back to index.html.
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"

const [root = "dist/web/browser", port = "4320"] = process.argv.slice(2)
const TYPES = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".webmanifest": "application/manifest+json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
}

createServer(async (request, response) => {
	const path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)).replace(/^(\.\.[/\\])+/, "")
	const file = join(root, path === "/" ? "index.html" : path)
	try {
		const body = await readFile(file)
		response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body)
	} catch {
		response.writeHead(200, { "content-type": "text/html" }).end(await readFile(join(root, "index.html")))
	}
}).listen(Number(port), "127.0.0.1")
