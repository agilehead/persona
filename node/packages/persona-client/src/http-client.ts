import type { Logger, Result } from "./types.js";
import { success, failure } from "./types.js";

export type InternalRequestOptions = {
  endpoint: string;
  method: string;
  path: string;
  secret: string;
  tenantId?: string;
  body?: unknown;
  timeout?: number;
  logger?: Logger;
};

export async function internalRequest<T>(
  options: InternalRequestOptions,
): Promise<Result<T>> {
  const { endpoint, method, path, secret, tenantId, body, timeout, logger } =
    options;

  const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const tenantParam =
    tenantId !== undefined ? `?tenant=${encodeURIComponent(tenantId)}` : "";
  const url = `${base}${path}${tenantParam}`;

  try {
    logger?.debug("Persona internal request:", { method, url });

    const controller = new AbortController();
    const timeoutId =
      timeout !== undefined
        ? setTimeout(() => {
            controller.abort();
          }, timeout)
        : undefined;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }

    logger?.debug("Persona internal response:", {
      status: response.status,
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      const message =
        errorBody.error ?? `Persona API error: ${String(response.status)}`;
      logger?.error("Persona internal request failed:", {
        status: response.status,
        error: message,
      });
      return failure(new Error(message));
    }

    const data = (await response.json()) as T;
    return success(data);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      logger?.error("Persona request timed out:", { url });
      return failure(new Error("Request timed out"));
    }
    const message = err instanceof Error ? err.message : String(err);
    logger?.error("Persona request error:", { url, error: message });
    return failure(new Error(`Network error: ${message}`));
  }
}
