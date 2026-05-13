import { z } from "zod";
import { AgentApiError } from "./agentApiClient";

export function errorMessageFromUnknown(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export function structuredToolError(error: unknown): {
	message: string;
	code?: string;
	status?: number;
} {
	if (error instanceof AgentApiError) {
		return { message: error.message, code: error.code, status: error.status };
	}
	return { message: errorMessageFromUnknown(error) };
}

/** Shared shape for HTTP-backed Mastra tools: same fields on success and failure. */
export const structuredAgentApiToolOutputSchema = z.object({
	success: z.boolean(),
	data: z.unknown().optional(),
	error: z
		.object({
			message: z.string(),
			code: z.string().optional(),
			status: z.number().optional(),
		})
		.optional(),
});
