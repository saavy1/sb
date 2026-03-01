/**
 * /ops command - Infrastructure operations
 */

import logger from "@nexus/logger";
import {
	ActionRowBuilder,
	ChatInputCommandBuilder,
	type ChatInputCommandInteraction,
	ComponentType,
	EmbedBuilder,
	MessageFlags,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from "discord.js";
import { client } from "../api";
import { COLORS, statusEmoji } from "../utils/embeds";

const log = logger.child({ module: "ops-command" });

export const opsCommand = new ChatInputCommandBuilder()
	.setName("ops")
	.setDescription("Infrastructure operations")
	.addSubcommands((sub) =>
		sub.setName("status").setDescription("Check infrastructure connectivity")
	)
	.addSubcommands((sub) => sub.setName("reconcile").setDescription("Trigger ArgoCD sync"))
	.addSubcommands((sub) => sub.setName("rebuild").setDescription("Trigger NixOS system rebuild"))
	.addSubcommands((sub) => sub.setName("history").setDescription("Show recent operations"));

export async function handleOpsCommand(interaction: ChatInputCommandInteraction) {
	const subcommand = interaction.options.getSubcommand();

	switch (subcommand) {
		case "status":
			return handleStatus(interaction);
		case "reconcile":
			return handleReconcile(interaction);
		case "rebuild":
			return handleRebuild(interaction);
		case "history":
			return handleHistory(interaction);
	}
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
	try {
		const { data, error } = await client.api.ops["test-connection"].get();

		if (error || !data) {
			log.error({ error }, "Failed to test connection");
			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ERROR)
						.setTitle("✗ Connection Test Failed")
						.setDescription("Could not reach the API"),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const { ssh, kubectl, argocd } = data;

		// Determine overall status
		const allSuccess = ssh.success && kubectl.success && argocd.success;
		const anyFailure = !ssh.success || !kubectl.success || !argocd.success;

		const embed = new EmbedBuilder()
			.setColor(allSuccess ? COLORS.SUCCESS : anyFailure ? COLORS.ERROR : COLORS.WARNING)
			.setTitle("Infrastructure Status")
			.setDescription("Connectivity to infrastructure components")
			.setTimestamp()
			.addFields(
				{
					name: `${statusEmoji(ssh.success ? "healthy" : "error")} SSH`,
					value: ssh.message || (ssh.success ? "Connected" : "Failed"),
					inline: true,
				},
				{
					name: `${statusEmoji(kubectl.success ? "healthy" : "error")} Kubectl`,
					value: kubectl.message || (kubectl.success ? "Connected" : "Failed"),
					inline: true,
				},
				{
					name: `${statusEmoji(argocd.success ? "healthy" : "error")} ArgoCD`,
					value: argocd.message || (argocd.success ? "Connected" : "Failed"),
					inline: true,
				}
			);

		await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
	} catch (err) {
		log.error({ err }, "Error in /ops status");
		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(COLORS.ERROR)
					.setTitle("✗ Error")
					.setDescription("An unexpected error occurred"),
			],
			flags: MessageFlags.Ephemeral,
		});
	}
}

async function handleReconcile(interaction: ChatInputCommandInteraction) {
	// Use select menu for confirmation
	const select = new StringSelectMenuBuilder()
		.setCustomId("confirm-reconcile")
		.setPlaceholder("Confirm ArgoCD sync?")
		.addOptions(
			new StringSelectMenuOptionBuilder()
				.setLabel("Yes, sync")
				.setDescription("Trigger ArgoCD application sync")
				.setValue("confirm"),
			new StringSelectMenuOptionBuilder()
				.setLabel("Cancel")
				.setDescription("Cancel the operation")
				.setValue("cancel")
		);

	const row = new ActionRowBuilder().addComponents(select);
	await interaction.reply({
		embeds: [
			new EmbedBuilder()
				.setColor(COLORS.WARNING)
				.setTitle("⚠ Confirm ArgoCD Sync")
				.setDescription("This will trigger an ArgoCD application sync."),
		],
		components: [row],
		flags: MessageFlags.Ephemeral,
	});

	const message = await interaction.fetchReply();
	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		time: 30_000,
	});

	collector.on("collect", async (menu) => {
		await menu.deferUpdate();
		const choice = menu.values[0];

		if (choice === "confirm") {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ACCENT)
						.setTitle("ArgoCD Sync")
						.setDescription("⏳ Starting sync..."),
				],
				components: [],
			});

			const { data, error } = await client.api.ops.trigger.post({
				type: "argocd-sync",
				source: "cli",
				user: interaction.user.tag,
			});

			if (error || !data) {
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(COLORS.ERROR)
							.setTitle("✗ Sync Failed")
							.setDescription("Could not trigger ArgoCD sync"),
					],
				});
				return;
			}

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.SUCCESS)
						.setTitle("✓ Sync Started")
						.setDescription(
							`Operation ID: \`${data.id}\`\n\nUse \`/ops history\` to check status.`
						),
				],
			});
		} else {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ACCENT)
						.setTitle("Cancelled")
						.setDescription("Reconcile cancelled"),
				],
				components: [],
			});
		}
		collector.stop("handled");
	});

	collector.on("end", async (_, reason) => {
		if (reason !== "handled") {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ACCENT)
						.setTitle("Timed Out")
						.setDescription("Confirmation timed out"),
				],
				components: [],
			});
		}
	});
}

async function handleRebuild(interaction: ChatInputCommandInteraction) {
	// Use select menu for confirmation
	const select = new StringSelectMenuBuilder()
		.setCustomId("confirm-rebuild")
		.setPlaceholder("Confirm NixOS rebuild?")
		.addOptions(
			new StringSelectMenuOptionBuilder()
				.setLabel("Yes, rebuild")
				.setDescription("⚠️ May cause brief service interruptions")
				.setValue("confirm"),
			new StringSelectMenuOptionBuilder()
				.setLabel("Cancel")
				.setDescription("Cancel the operation")
				.setValue("cancel")
		);

	const row = new ActionRowBuilder().addComponents(select);
	await interaction.reply({
		embeds: [
			new EmbedBuilder()
				.setColor(COLORS.WARNING)
				.setTitle("⚠ Confirm NixOS Rebuild")
				.setDescription(
					"This will trigger a full NixOS system rebuild.\n\n**Warning:** This may cause brief service interruptions."
				),
		],
		components: [row],
		flags: MessageFlags.Ephemeral,
	});

	const message = await interaction.fetchReply();
	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		time: 30_000,
	});

	collector.on("collect", async (menu) => {
		await menu.deferUpdate();
		const choice = menu.values[0];

		if (choice === "confirm") {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ACCENT)
						.setTitle("NixOS Rebuild")
						.setDescription("⏳ Starting rebuild..."),
				],
				components: [],
			});

			const { data, error } = await client.api.ops.trigger.post({
				type: "nixos-rebuild",
				source: "cli",
				user: interaction.user.tag,
			});

			if (error || !data) {
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(COLORS.ERROR)
							.setTitle("✗ Rebuild Failed")
							.setDescription("Could not trigger rebuild"),
					],
				});
				return;
			}

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.SUCCESS)
						.setTitle("✓ Rebuild Started")
						.setDescription(
							`Operation ID: \`${data.id}\`\n\nUse \`/ops history\` to check status.`
						),
				],
			});
		} else {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ACCENT)
						.setTitle("Cancelled")
						.setDescription("Rebuild cancelled"),
				],
				components: [],
			});
		}
		collector.stop("handled");
	});

	collector.on("end", async (_, reason) => {
		if (reason !== "handled") {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ACCENT)
						.setTitle("Timed Out")
						.setDescription("Confirmation timed out"),
				],
				components: [],
			});
		}
	});
}

async function handleHistory(interaction: ChatInputCommandInteraction) {
	try {
		const { data, error } = await client.api.ops.operations.get({ query: { limit: "10" } });

		if (error || !data) {
			log.error({ error }, "Failed to fetch operations");
			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ERROR)
						.setTitle("✗ Failed to fetch operations")
						.setDescription("Could not connect to the API"),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const operations = Array.isArray(data) ? data : [];

		if (operations.length === 0) {
			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ACCENT)
						.setTitle("Operations History")
						.setDescription("No operations found"),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const lines = operations.slice(0, 10).map((op) => {
			const emoji = statusEmoji(op.status);
			const duration = op.durationMs ? `${(op.durationMs / 1000).toFixed(1)}s` : "...";
			const time = new Date(op.startedAt).toLocaleString("en-US", {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
			return `${emoji} **${op.type}** • ${duration} • ${time}`;
		});

		const embed = new EmbedBuilder()
			.setColor(COLORS.ACCENT)
			.setTitle("Operations History")
			.setDescription("Recent infrastructure operations")
			.setTimestamp()
			.addFields({
				name: "Recent Operations",
				value: lines.join("\n"),
				inline: false,
			});

		await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
	} catch (err) {
		log.error({ err }, "Error in /ops history");
		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(COLORS.ERROR)
					.setTitle("✗ Error")
					.setDescription("An unexpected error occurred"),
			],
			flags: MessageFlags.Ephemeral,
		});
	}
}
