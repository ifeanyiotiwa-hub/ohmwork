import { CircuitDocument } from "@engineering-circuit/editing"
import { createCircuit } from "@engineering-circuit/format"
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { LiveServer } from "./live/live-server"
import { optionsFromEnvironment } from "./options"
import { createServer } from "./server"

const options = optionsFromEnvironment(process.env, process.cwd())
const document = new CircuitDocument(createCircuit("Untitled"), { historyLimit: options.historyLimit })

let live: LiveServer | undefined
try {
	live = await LiveServer.start(document, { ...options.live, maxMessageBytes: options.maxFileBytes })
	// stdout carries the MCP protocol, so diagnostics go to stderr.
	console.error(`OhmWork live link listening on ${live.address}`)
} catch (error) {
	console.error(`OhmWork live link is off: ${error instanceof Error ? error.message : String(error)}`)
}

await createServer(options, live ? { document, live } : { document }).connect(new StdioServerTransport())
