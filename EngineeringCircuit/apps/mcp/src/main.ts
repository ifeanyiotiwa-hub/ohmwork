import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { optionsFromEnvironment } from "./options"
import { createServer } from "./server"

await createServer(optionsFromEnvironment(process.env, process.cwd())).connect(new StdioServerTransport())
