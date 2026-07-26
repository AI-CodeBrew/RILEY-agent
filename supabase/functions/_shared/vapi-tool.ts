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
}

/**
 * Pulls the tool-call id and arguments out of Vapi's envelope, falling back to
 * a raw body so these functions stay curl-testable. `arguments` arrives as an
 * object most of the time but as a JSON string often enough to matter.
 */
export function parseVapiToolCall(body: unknown): ParsedToolCall {
  const message = (body as { message?: { toolCalls?: unknown[] } })?.message;
  const call = message?.toolCalls?.[0] as
    | { id?: string; function?: { arguments?: unknown } }
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

  return { toolCallId: call?.id ?? null, args };
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
