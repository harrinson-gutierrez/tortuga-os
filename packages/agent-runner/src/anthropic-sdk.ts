import Anthropic from '@anthropic-ai/sdk'
import type { AgentRunCallbacks, AgentRunOutcome, AgentRunSpec, AgentRunner } from './port'

/**
 * Anthropic SDK adapter.
 *
 * Direct API call (no CLI, no tool use, no workspace edits). The runner
 * emits text deltas via onChunk while streaming. Cost is computed from
 * the Messages usage block using the per-model price table below.
 *
 * Workspace access: this adapter does NOT touch the filesystem. If a
 * task needs file editing, use the claude-cli adapter instead.
 */

const DEFAULT_MODEL = 'claude-opus-4-7'
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_TIMEOUT_MS = 10 * 60_000

interface ModelPrice {
  inputPerMTok: number
  outputPerMTok: number
}

const PRICE_TABLE: Record<string, ModelPrice> = {
  'claude-opus-4-7': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-4-5-20251001': { inputPerMTok: 1, outputPerMTok: 5 },
}

function computeCostCents(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICE_TABLE[model]
  if (!price) return 0
  const usd =
    (tokensIn / 1_000_000) * price.inputPerMTok + (tokensOut / 1_000_000) * price.outputPerMTok
  return Math.round(usd * 100)
}

export class AnthropicSdkRunner implements AgentRunner {
  readonly provider = 'anthropic-sdk' as const
  readonly defaultModel = DEFAULT_MODEL

  private readonly controllers = new Map<string, AbortController>()

  async run(spec: AgentRunSpec, callbacks: AgentRunCallbacks): Promise<AgentRunOutcome> {
    const apiKey = spec.env?.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return {
        kind: 'failed',
        errorMessage: 'ANTHROPIC_API_KEY not set (env or spec.env)',
        output: '',
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
      }
    }

    const client = new Anthropic({ apiKey })
    const controller = new AbortController()
    this.controllers.set(spec.runId, controller)

    const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let outputBuf = ''
    let tokensIn = 0
    let tokensOut = 0
    const model = spec.model || this.defaultModel

    try {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: DEFAULT_MAX_TOKENS,
          system: spec.systemPrompt,
          messages: [{ role: 'user', content: spec.userPrompt }],
        },
        { signal: controller.signal },
      )

      stream.on('text', (delta: string) => {
        outputBuf += delta
        callbacks.onChunk?.(delta)
      })

      const final = await stream.finalMessage()
      const usage = final.usage as {
        input_tokens?: number
        output_tokens?: number
        cache_read_input_tokens?: number
      }
      tokensIn = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
      tokensOut = usage.output_tokens ?? 0
      const costCents = computeCostCents(model, tokensIn, tokensOut)
      callbacks.onUsage?.({ tokensIn, tokensOut, costCents })

      return { kind: 'succeeded', output: outputBuf, tokensIn, tokensOut, costCents }
    } catch (err) {
      const aborted = controller.signal.aborted
      const costCents = computeCostCents(model, tokensIn, tokensOut)
      if (aborted) {
        return { kind: 'cancelled', output: outputBuf, tokensIn, tokensOut, costCents }
      }
      return {
        kind: 'failed',
        errorMessage: (err as Error).message,
        output: outputBuf,
        tokensIn,
        tokensOut,
        costCents,
      }
    } finally {
      clearTimeout(timer)
      this.controllers.delete(spec.runId)
    }
  }

  cancel(runId: string): void {
    const controller = this.controllers.get(runId)
    if (!controller) return
    controller.abort()
  }
}
