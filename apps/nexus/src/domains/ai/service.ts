import { chat, toStreamResponse } from "@tanstack/ai";
import { createOpenAI } from "@tanstack/ai-openai";
import logger from "logger";
import { config } from "../../infra/config";
import { appTools } from "../apps/functions";
import { gameServerTools } from "../game-servers/functions";
import { opsTools } from "../ops/functions";
import { systemInfoTools } from "../system-info/functions";
import type { ChatMessageType } from "./types";

const log = logger.child({ module: "ai" });

const SYSTEM_PROMPT = `You are The Machine, the AI assistant for Superbloom - a homelab server running NixOS with K3s.

Your personality:
- Helpful and knowledgeable about the homelab infrastructure
- Concise but friendly responses
- You care about the system's health and the user's experience
- You warn about consequences before destructive actions

You have access to tools to:
- List, start, stop, create, and delete Minecraft game servers
- Get system stats (CPU, memory, GPU, network)
- Get drive/storage information
- List apps/services and get their URLs (use this when users ask "what's the X url")
- Trigger infrastructure operations (NixOS rebuild, Flux reconcile)
- Check operation status and history

When users ask about servers or system status, use your tools to get real data.
Always respond in natural language, never raw JSON.`;

// Collect all domain tools
const allTools = [...gameServerTools, ...systemInfoTools, ...appTools, ...opsTools];

function extractContent(msg: ChatMessageType): string {
	if (msg.content) return msg.content;
	if (msg.parts) {
		const textParts = msg.parts
			.filter((p) => p.type === "text")
			.map((p) => p.content || p.text || "")
			.filter(Boolean);
		if (textParts.length > 0) return textParts.join("\n");
	}
	return "";
}

function transformMessages(messages: ChatMessageType[]) {
	return messages
		.filter((msg) => msg.role !== "tool")
		.map((msg) => ({
			role: msg.role as "user" | "assistant",
			content: extractContent(msg),
		}))
		.filter((msg) => msg.content);
}

export const aiService = {
	chat(messages: ChatMessageType[]) {
		if (!config.OPENROUTER_API_KEY) {
			throw new Error("OPENROUTER_API_KEY not configured");
		}

		log.info({ messageCount: messages.length }, "processing chat request");

		const adapter = createOpenAI(config.OPENROUTER_API_KEY, {
			baseURL: "https://openrouter.ai/api/v1",
		});

		const transformedMessages = transformMessages(messages);

		const messagesWithSystem = [
			{
				role: "user" as const,
				content: `[SYSTEM]\n${SYSTEM_PROMPT}\n[/SYSTEM]\n\nPlease acknowledge you understand these instructions.`,
			},
			{
				role: "assistant" as const,
				content: "I understand. I'm The Machine, ready to help manage your Superbloom homelab.",
			},
			...transformedMessages,
		];

		const stream = chat({
			adapter,
			messages: messagesWithSystem,
			model: config.AI_MODEL as string as (typeof adapter.models)[number],
			tools: allTools,
		});

		log.info({ model: config.AI_MODEL }, "streaming chat response");
		return toStreamResponse(stream);
	},
};
