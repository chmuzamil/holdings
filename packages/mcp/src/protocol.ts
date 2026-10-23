import type { Readable, Writable } from 'node:stream'
import { createInterface } from 'node:readline'

// The small part of the Model Context Protocol a read-only tool server needs:
// JSON-RPC 2.0 over stdio (one message per line), with initialize, ping,
// tools/list and tools/call. https://modelcontextprotocol.io/specification

export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

export interface Tool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

/** A problem the agent caused (unknown project, bad argument): shown to it as a tool error. */
export class ToolError extends Error {}

interface Request {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

type Response =
  | { jsonrpc: '2.0'; id: string | number | null; result: unknown }
  | { jsonrpc: '2.0'; id: string | number | null; error: { code: number; message: string } }

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602

export function createMcpServer({ name, version, instructions, tools }: { name: string; version: string; instructions: string; tools: Tool[] }) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]))

  async function call(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'initialize': {
        const requested = String(params.protocolVersion ?? '')
        return {
          protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
          instructions,
        }
      }
      case 'ping':
        return {}
      case 'tools/list':
        return {
          tools: tools.map(({ name: toolName, title, description, inputSchema }) => ({
            name: toolName,
            title,
            description,
            inputSchema,
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
          })),
        }
      case 'tools/call': {
        const tool = byName.get(String(params.name))
        if (!tool) throw new RpcError(INVALID_PARAMS, `Unknown tool: ${String(params.name)}`)
        const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {}
        try {
          const result = await tool.run(args)
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result }
        } catch (error) {
          // Tool problems go back to the agent so it can correct itself.
          const message = error instanceof ToolError ? error.message : `Couldn't read your Holdings data: ${(error as Error).message}`
          return { content: [{ type: 'text', text: message }], isError: true }
        }
      }
      default:
        throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`)
    }
  }

  /** Handles one JSON-RPC message. Returns the response, or null for notifications. */
  async function handle(message: unknown): Promise<Response | null> {
    if (!message || typeof message !== 'object' || (message as Request).jsonrpc !== '2.0' || typeof (message as Request).method !== 'string') {
      return { jsonrpc: '2.0', id: null, error: { code: INVALID_REQUEST, message: 'Invalid request' } }
    }
    const request = message as Request
    const isNotification = request.id === undefined
    try {
      const result = await call(request.method, request.params ?? {})
      return isNotification ? null : { jsonrpc: '2.0', id: request.id ?? null, result }
    } catch (error) {
      if (isNotification) return null
      const code = error instanceof RpcError ? error.code : -32603
      return { jsonrpc: '2.0', id: request.id ?? null, error: { code, message: (error as Error).message } }
    }
  }

  /** Reads one message per line from input and writes responses to output. */
  function serve(input: Readable, output: Writable) {
    const lines = createInterface({ input, crlfDelay: Infinity })
    lines.on('line', async (line) => {
      if (!line.trim()) return
      let message: unknown
      try {
        message = JSON.parse(line)
      } catch {
        output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Parse error' } })}\n`)
        return
      }
      const response = await handle(message)
      if (response) output.write(`${JSON.stringify(response)}\n`)
    })
    return lines
  }

  return { handle, serve }
}

class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message)
  }
}
