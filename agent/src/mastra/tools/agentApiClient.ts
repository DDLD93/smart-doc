type HttpMethod = "GET" | "POST";

type Primitive = string | number | boolean;

export class AgentApiError extends Error {
	status?: number;
	code?: string;
	details?: unknown;

	constructor(message: string, options?: { status?: number; code?: string; details?: unknown }) {
		super(message);
		this.name = "AgentApiError";
		this.status = options?.status;
		this.code = options?.code;
		this.details = options?.details;
	}
}

type RequestOptions = {
	method: HttpMethod;
	path: string;
	query?: Record<string, Primitive | null | undefined>;
	body?: unknown;
	baseUrl?: string;
	timeoutMs?: number;
};

function sanitizeBaseUrl(baseUrl?: string) {
	const raw = baseUrl || process.env.FILESERVER_BASE_URL;
	return raw?.replace(/\/+$/, "");
}

function buildQueryString(query?: Record<string, Primitive | null | undefined>) {
	if (!query) return "";
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") continue;
		params.append(key, String(value));
	}
	const encoded = params.toString();
	return encoded ? `?${encoded}` : "";
}

export async function requestAgentApi<T>(options: RequestOptions): Promise<T> {
	const baseUrl = sanitizeBaseUrl(options.baseUrl);
	const timeoutMs = options.timeoutMs ?? 30_000;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	const url = `${baseUrl}${options.path}${buildQueryString(options.query)}`;

	try {
		const response = await fetch(url, {
			method: options.method,
			headers: options.method === "POST" ? { "Content-Type": "application/json" } : undefined,
			body: options.method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
			signal: controller.signal,
		});

		const contentType = response.headers.get("content-type") || "";
		const isJson = contentType.includes("application/json");
		const payload = isJson ? await response.json().catch(() => null) : await response.text().catch(() => "");

		if (!response.ok) {
			const message =
				(typeof payload === "object" &&
					payload !== null &&
					"error" in payload &&
					typeof (payload as { error?: unknown }).error === "string" &&
					(payload as { error: string }).error) ||
				`HTTP ${response.status} ${response.statusText}`;
			const code =
				typeof payload === "object" &&
				payload !== null &&
				"code" in payload &&
				typeof (payload as { code?: unknown }).code === "string"
					? (payload as { code: string }).code
					: undefined;
			throw new AgentApiError(message, { status: response.status, code, details: payload });
		}

		return payload as T;
	} catch (error) {
		if (error instanceof AgentApiError) {
			throw error;
		}
		if (error instanceof Error && error.name === "AbortError") {
			throw new AgentApiError(`Request timeout after ${timeoutMs}ms`, { details: { path: options.path } });
		}
		throw new AgentApiError(error instanceof Error ? error.message : "Unknown network error", {
			details: { path: options.path },
		});
	} finally {
		clearTimeout(timeout);
	}
}

