/**
 * Request/response plumbing for Vapi custom tools.
 *
 * Vapi doesn't hand the model whatever JSON a tool server returns. It looks
 * for an envelope:
 *
 *   { "results": [ { "toolCallId": "<the id it sent>", "result": "<string>" } ] }
 *
 * and uses `toolCallId` to match the output back to the tool call the model is
 * waiting on. Return a bare object instead and Vapi still reports the tool as
 * "completed successfully" (it was a 200, after all) — but the model gets no
 * result for its pending call, and the turn dies with
 * `pipeline-error-openai-llm-failed`.
 */
import { jsonResponse } from "./cors.ts";

interface ParsedToolCall {
  /** null when called directly (curl, tests) rather than through Vapi. */
  toolCallId: string | null;
  args: Record<string, unknown>;
  /**
   * `metadata` set when the call was created (customerId / agentId). Vapi
   * never shows this to the model — it only reaches the server — so it's the
   * trustworthy source for ids. Prefer it over whatever the model passed in
   * `args`, which is a UUID it had to copy by hand.
   */
  metadata: Record<string, unknown>;
}

/**
 * Pulls the tool-call id and arguments out of Vapi's envelope, falling back to
 * a raw body so these functions stay curl-testable. `arguments` arrives as an
 * object most of the time but as a JSON string often enough to matter.
 */
export function parseVapiToolCall(body: unknown): ParsedToolCall {
  const root = body as {
    message?: {
      toolCalls?: unknown[];
      toolCallList?: unknown[];
      metadata?: Record<string, unknown>;
      call?: {
        metadata?: Record<string, unknown>;
        assistantOverrides?: { metadata?: Record<string, unknown> };
      };
    };
    call?: {
      metadata?: Record<string, unknown>;
      assistantOverrides?: { metadata?: Record<string, unknown> };
    };
  };

  const message = root?.message ?? root;
  const toolCalls = (message as { toolCalls?: unknown[]; toolCallList?: unknown[] })
    ?.toolCalls ??
    (message as { toolCallList?: unknown[] })?.toolCallList ??
    [];

  const call = toolCalls[0] as
    | { id?: string; function?: { arguments?: unknown; name?: string } }
    | undefined;

  const raw = call?.function?.arguments ?? body;
  let args: Record<string, unknown> = {};

  if (typeof raw === "string") {
    try {
      args = JSON.parse(raw);
    } catch {
      args = {};
    }
  } else if (raw && typeof raw === "object") {
    args = raw as Record<string, unknown>;
  }

  const metadata =
    (message as { call?: { assistantOverrides?: { metadata?: Record<string, unknown> }; metadata?: Record<string, unknown> } })
      ?.call?.assistantOverrides?.metadata ??
    (message as { call?: { metadata?: Record<string, unknown> } })?.call?.metadata ??
    (message as { metadata?: Record<string, unknown> })?.metadata ??
    root?.call?.assistantOverrides?.metadata ??
    root?.call?.metadata ??
    {};

  return { toolCallId: call?.id ?? null, args, metadata };
}

/**
 * `agent_id`/`customer_id` are never exposed to the model in the tool
 * schema, so `args` is not a legitimate source for them — only `metadata`
 * (set server-side, from trusted DB rows, when the call was created) is
 * trustworthy. These functions have `verify_jwt = false`, so trusting a
 * caller-supplied id here would let anyone who can reach the public URL
 * read or book against an arbitrary customer/agent. Curl-testing still
 * works: put the id under any of the metadata shapes `parseVapiToolCall`
 * already accepts.
 */
export function resolveId(
  metadata: Record<string, unknown>,
  metadataKey: string
): string | undefined {
  const fromMetadata = metadata?.[metadataKey];
  return typeof fromMetadata === "string" && fromMetadata ? fromMetadata : undefined;
}

/**
 * Success path. Direct (non-Vapi) callers get the plain payload so the shape
 * documented at the top of each function still holds when curling it.
 */
export function toolResult(toolCallId: string | null, payload: unknown) {
  if (!toolCallId) return jsonResponse(payload);

  return jsonResponse({
    results: [
      {
        toolCallId,
        result: typeof payload === "string" ? payload : JSON.stringify(payload),
      },
    ],
  });
}

/**
 * Failure path — deliberately still a 200 when Vapi is calling.
 *
 * A non-2xx leaves the model with nothing to say and kills the turn. Handing
 * it the error as a normal tool result lets it follow the "Tool error" branch
 * of the system prompt: apologise, offer a follow-up, stay on the call.
 */
export function toolError(
  toolCallId: string | null,
  message: string,
  status = 400
) {
  if (!toolCallId) return jsonResponse({ error: message }, status);

  return toolResult(toolCallId, { error: message });
}
