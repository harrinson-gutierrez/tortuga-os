/**
 * Agent runner port.
 *
 * Abstraction over local LLM execution. Concrete adapters live in
 * separate exports of this package (claude-cli is the only one shipping
 * in MVP; anthropic-sdk and ollama come later).
 */

import type { AgentKind, AgentProvider } from '@tortuga-os/contracts'

export interface AgentRunSpec {
  /** Run identifier — used by adapters to key in-flight subprocesses. */
  runId: string
  /** The agent role we are emulating. Drives prompt selection. */
  agentKind: AgentKind
  /** System prompt for the LLM. Pre-composed by the caller. */
  systemPrompt: string
  /** User-facing message to send first. */
  userPrompt: string
  /** Concrete model identifier (e.g. 'claude-opus-4-7'). */
  model: string
  /** Absolute path the agent is allowed to read/write. The adapter must
   *  ensure no access outside this directory. */
  workspacePath: string
  /** Hard timeout in ms. */
  timeoutMs?: number
  /** Optional extra env vars passed to the subprocess / sdk client. */
  env?: Readonly<Record<string, string>>
  /**
   * Optional MCP servers to expose to the agent in this run. The caller
   * (sidecar) reads the enabled `mcp_connections` rows and passes them
   * here; the adapter writes them out as Claude CLI's --mcp-config JSON.
   */
  mcpServers?: McpServerConfig[]
  /**
   * Extra absolute directories the agent is allowed to read (but not
   * write). Used to expose the bundled skills pack root from the resource
   * bundle so the agent's Read tool can load skill.md files referenced
   * in the system prompt without copying them into the workspace.
   */
  extraReadDirs?: string[]
  /**
   * Deterministic session id to maximize Claude CLI prompt-cache reuse
   * within a logical unit of work (e.g. all roles within a single phase
   * share the same id). When omitted the adapter generates a fresh uuid
   * per run.
   */
  sessionId?: string
}

/** Shape Claude CLI expects in `--mcp-config <file.json>`. */
export interface McpServerConfig {
  name: string
  /** stdio: process command + args + env. */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** http: URL + headers. */
  url?: string
  headers?: Record<string, string>
}

export interface AgentRunCallbacks {
  /** Called whenever the runner emits an output delta (token / chunk). */
  onChunk?(text: string): void
  /** Called when the runner reports a tool-call (Read, Edit, Bash, …). */
  onToolCall?(tool: string, input: unknown): void
  /** Called once the runner has token usage / cost data. */
  onUsage?(usage: { tokensIn: number; tokensOut: number; costCents: number }): void
}

export type AgentRunOutcome =
  | { kind: 'succeeded'; output: string; tokensIn: number; tokensOut: number; costCents: number }
  | {
      kind: 'failed'
      errorMessage: string
      output: string
      tokensIn: number
      tokensOut: number
      costCents: number
    }
  | { kind: 'cancelled'; output: string; tokensIn: number; tokensOut: number; costCents: number }

export interface AgentRunner {
  readonly provider: AgentProvider
  readonly defaultModel: string

  /** Runs the agent and resolves once it finishes or fails. */
  run(spec: AgentRunSpec, callbacks: AgentRunCallbacks): Promise<AgentRunOutcome>

  /** Cancel an in-flight run by id. No-op if the run is not active. */
  cancel(runId: string): void
}
