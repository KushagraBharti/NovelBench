import { getOpenRouterCircuitBreaker } from "./circuit-breaker";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface StreamDeltaChunk {
  choices?: { delta?: { content?: string } }[];
}

export interface ChatToolFunction {
  name: string;
  arguments: string;
}

export interface ChatToolCall {
  id: string;
  type: "function";
  function: ChatToolFunction;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ChatToolCall[];
}

export interface ReasoningConfig {
  effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  exclude?: boolean;
}

export interface ChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenRouterResponse {
  choices: {
    message: {
      content?: string | null;
      tool_calls?: ChatToolCall[];
    };
    finish_reason?: string | null;
  }[];
  error?: {
    message: string;
    code: number;
  };
}

export interface CallModelOptions {
  maxRetries?: number;
  reasoning?: ReasoningConfig;
  timeoutMs?: number;
  signal?: AbortSignal;
  onBeforeRequest?: (body: Record<string, unknown>) => void | Promise<void>;
  tools?: ChatToolDefinition[];
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  parallelToolCalls?: boolean;
}

const DEFAULT_TIMEOUT_MS = 90_000;

export function buildChatCompletionBody(
  openRouterId: string,
  messages: ChatMessage[],
  options: Pick<CallModelOptions, "reasoning" | "tools" | "toolChoice" | "parallelToolCalls"> & { stream?: boolean }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: openRouterId,
    messages,
    temperature: 0.8,
  };

  if (options.stream) {
    body.stream = true;
  }

  if (options.reasoning) {
    body.reasoning = options.reasoning;
  }

  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
    body.parallel_tool_calls = options.parallelToolCalls ?? false;
  }

  return body;
}

function timeoutSignal(ms: number, signal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${ms}ms`)), ms);

  signal?.addEventListener(
    "abort",
    () => {
      controller.abort(signal.reason);
      clearTimeout(timer);
    },
    { once: true }
  );

  controller.signal.addEventListener(
    "abort",
    () => clearTimeout(timer),
    { once: true }
  );

  return controller.signal;
}

async function requestOpenRouter(
  body: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set in environment variables");
  }

  const breaker = getOpenRouterCircuitBreaker();
  const gate = breaker.canRequest();
  if (!gate.ok) {
    throw new Error("OpenRouter circuit breaker is open");
  }

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://novelbench.dev",
        "X-Title": "NovelBench Creativity Benchmark",
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(timeoutMs, signal),
    });

    if (!response.ok) {
      const text = await response.text();
      breaker.recordFailure(`OpenRouter API error (${response.status})`);
      throw new Error(`OpenRouter API error (${response.status}): ${text}`);
    }

    breaker.recordSuccess();
    return response;
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      breaker.recordFailure(error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}

export async function callModel(
  openRouterId: string,
  messages: ChatMessage[],
  options: CallModelOptions = {}
): Promise<string> {
  const { maxRetries = 2, reasoning, timeoutMs = DEFAULT_TIMEOUT_MS, signal, onBeforeRequest } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const body = buildChatCompletionBody(openRouterId, messages, { reasoning, tools: options.tools, toolChoice: options.toolChoice, parallelToolCalls: options.parallelToolCalls });
      await onBeforeRequest?.(body);
      const response = await requestOpenRouter(body, timeoutMs, signal);
      const data: OpenRouterResponse = await response.json();

      if (data.error) {
        throw new Error(`OpenRouter error: ${data.error.message}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("No content in OpenRouter response");
      }

      return content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (signal?.aborted) throw lastError;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("Unknown error calling OpenRouter");
}

export interface CallModelTurnResult {
  content: string;
  toolCalls: ChatToolCall[];
  finishReason?: string | null;
}

export async function callModelTurn(
  openRouterId: string,
  messages: ChatMessage[],
  options: CallModelOptions = {}
): Promise<CallModelTurnResult> {
  const {
    reasoning,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    onBeforeRequest,
    tools,
    toolChoice,
    parallelToolCalls,
  } = options;

  const body = buildChatCompletionBody(openRouterId, messages, {
    reasoning,
    tools,
    toolChoice,
    parallelToolCalls,
  });
  await onBeforeRequest?.(body);
  const response = await requestOpenRouter(body, timeoutMs, signal);
  const data: OpenRouterResponse = await response.json();

  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }

  const choice = data.choices?.[0];
  const message = choice?.message;
  if (!message) {
    throw new Error("No message in OpenRouter response");
  }

  return {
    content: typeof message.content === "string" ? message.content : "",
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    finishReason: choice?.finish_reason,
  };
}

export async function* streamModel(
  openRouterId: string,
  messages: ChatMessage[],
  options: CallModelOptions = {}
): AsyncGenerator<string> {
  const { reasoning, timeoutMs = DEFAULT_TIMEOUT_MS, signal, onBeforeRequest } = options;
  const body = buildChatCompletionBody(openRouterId, messages, {
    reasoning,
    stream: true,
    tools: options.tools,
    toolChoice: options.toolChoice,
    parallelToolCalls: options.parallelToolCalls,
  });
  await onBeforeRequest?.(body);

  const response = await requestOpenRouter(body, timeoutMs, signal);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      throw signal.reason instanceof Error ? signal.reason : new Error("Aborted");
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        const parsed: StreamDeltaChunk = JSON.parse(data);
        const chunk = parsed.choices?.[0]?.delta?.content;
        if (chunk) yield chunk;
      } catch {
        // Ignore malformed chunks.
      }
    }
  }
}
