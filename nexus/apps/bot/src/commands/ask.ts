import type { DiscordAskJobDataType } from "@nexus/core/domains/agent";
import { getOrCreateThread } from "@nexus/core/domains/agent";
import { discordAsksQueue } from "@nexus/core/infra";
import logger from "@nexus/logger";
import { ChatInputCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { z } from "zod";

const log = logger.child({ module: "ask-command" });

const questionSchema = z.string().min(1, "Question cannot be empty").max(2000, "Question too long");

export const askCommand = new ChatInputCommandBuilder()
	.setName("ask")
	.setDescription("Ask The Machine a question")
	.addStringOptions((opt) =>
		opt.setName("question").setDescription("Your question or request").setRequired(true)
	);

export async function handleAskCommand(interaction: ChatInputCommandInteraction) {
	// Validate input
	const questionResult = questionSchema.safeParse(interaction.options.getString("question", true));
	if (!questionResult.success) {
		await interaction.reply({
			content: questionResult.error.issues.map((i) => i.message).join(", "),
			flags: 64, // Ephemeral
		});
		return;
	}

	const question = questionResult.data;
	const channelId = interaction.channelId;
	const userId = interaction.user.id;

	log.info({ channelId, userId, questionLength: question.length }, "Processing /ask command");

	// Defer the reply - this gives us 15 minutes to respond
	await interaction.deferReply();

	try {
		// Get or create a thread for this channel
		// Using channelId as sourceId so conversations in the same channel share context
		const thread = await getOrCreateThread("discord", channelId);

		log.info({ threadId: thread.id, channelId }, "Got thread for Discord ask");

		// Queue the job for the worker to process
		await discordAsksQueue.add("discord-ask", {
			threadId: thread.id,
			content: question,
			interactionToken: interaction.token,
			applicationId: interaction.client.application.id,
		} satisfies DiscordAskJobDataType);

		log.info({ threadId: thread.id }, "Queued Discord ask job");

		// Update the deferred reply to show it's processing
		await interaction.editReply("Thinking...");
	} catch (err) {
		log.error({ err, channelId }, "Failed to process /ask command");
		await interaction.editReply("Sorry, something went wrong. Please try again.");
	}
}
