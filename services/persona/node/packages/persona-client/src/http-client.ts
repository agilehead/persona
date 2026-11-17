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
  ifMatch?: string;
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

  const controller = new AbortController();
  const timeoutId =
    timeout === undefined
      ? undefined
      : setTimeout(() => controller.abort(), timeout);
  try {
    logger?.debug("Persona internal request:", { method, url });
    const response = await fetch(url, {
      method,
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
        ...(options.ifMatch === undefined
          ? {}
          : { "If-Match": options.ifMatch }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });

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
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
