import type { GameServerType } from "@nexus/domains/game-servers/types";
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
import { gameServers } from "../api";
import { modpackSlugSchema, selectMenuValueSchema, serverNameSchema } from "../schemas/discord";

export const serverCommand = new ChatInputCommandBuilder()
	.setName("server")
	.setDescription("Manage game servers")
	.addSubcommands((sub) =>
		sub
			.setName("create")
			.setDescription("Create a new Minecraft server")
			.addStringOptions((opt) =>
				opt.setName("name").setDescription("Server name").setRequired(true)
			)
			.addStringOptions((opt) =>
				opt
					.setName("modpack")
					.setDescription("CurseForge modpack slug (e.g., all-the-mods-10)")
					.setRequired(true)
			)
	)
	.addSubcommands((sub) => sub.setName("list").setDescription("List all servers"))
	.addSubcommands((sub) =>
		sub
			.setName("status")
			.setDescription("Get server status")
			.addStringOptions((opt) =>
				opt.setName("name").setDescription("Server name").setRequired(true)
			)
	)
	.addSubcommands((sub) => sub.setName("start").setDescription("Start a server"))
	.addSubcommands((sub) => sub.setName("stop").setDescription("Stop a server"))
	.addSubcommands((sub) =>
		sub
			.setName("delete")
			.setDescription("Delete a server")
			.addStringOptions((opt) =>
				opt.setName("name").setDescription("Server name").setRequired(true)
			)
	);

export async function handleServerCommand(interaction: ChatInputCommandInteraction) {
	const subcommand = interaction.options.getSubcommand();

	switch (subcommand) {
		case "create":
			return handleCreate(interaction);
		case "list":
			return handleList(interaction);
		case "status":
			return handleStatus(interaction);
		case "start":
			return handleStartWithMenu(interaction);
		case "stop":
			return handleStopWithMenu(interaction);
		case "delete":
			return handleDelete(interaction);
	}
}

async function handleCreate(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const nameResult = serverNameSchema.safeParse(interaction.options.getString("name", true));
	const modpackResult = modpackSlugSchema.safeParse(interaction.options.getString("modpack", true));
	if (!nameResult.success || !modpackResult.success) {
		const message = [
			...(!nameResult.success ? nameResult.error.issues.map((i) => `name: ${i.message}`) : []),
			...(!modpackResult.success
				? modpackResult.error.issues.map((i) => `modpack: ${i.message}`)
				: []),
		].join("\n");
		await interaction.editReply(`invalid input:\n${message}`);
		return;
	}

	const name = nameResult.data;
	const modpack = modpackResult.data;

	const { data, error } = await gameServers.post({
		name,
		modpack,
		createdBy: interaction.user.id,
	});

	if (error || !data) {
		await interaction.editReply(
			`Failed to create server: ${String(error?.value) || "Unknown error"}`
		);
		return;
	}

	const server = data;
	const embed = new EmbedBuilder()
		.setTitle("Server Created")
		.setColor(0x57f287)
		.setDescription(`**${server.name}** is being provisioned.`)
		.addFields(
			{ name: "Modpack", value: modpack, inline: true },
			{ name: "Status", value: server.status, inline: true }
		)
		.setFooter({ text: "Use /server start to bring it online" });

	await interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const { data, error } = await gameServers.get();

	if (error || !data) {
		await interaction.editReply(
			`Failed to list servers: ${String(error?.value) || "Unknown error"}`
		);
		return;
	}

	const servers = data;
	if (servers.length === 0) {
		await interaction.editReply("No servers found. Create one with `/server create`");
		return;
	}

	const embed = new EmbedBuilder()
		.setTitle("Game Servers")
		.setColor(0x5865f2)
		.setDescription(
			servers
				.map(
					(s) => `${statusEmoji(s.status)} **${s.name}** - ${s.modpack || "vanilla"} (${s.status})`
				)
				.join("\n")
		);

	await interaction.editReply({ embeds: [embed] });
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const nameResult = serverNameSchema.safeParse(interaction.options.getString("name", true));
	if (!nameResult.success) {
		await interaction.editReply(
			`invalid input:\n${nameResult.error.issues.map((i) => i.message).join("\n")}`
		);
		return;
	}
	const name = nameResult.data;
	const { data, error } = await gameServers({ name }).get();

	if (error || !data) {
		await interaction.editReply(`Failed to get status: ${String(error?.value) || "Unknown error"}`);
		return;
	}

	const server = data;
	const embed = new EmbedBuilder()
		.setTitle(server.name)
		.setColor(statusColor(server.status))
		.addFields(
			{
				name: "Status",
				value: `${statusEmoji(server.status)} ${server.status}`,
				inline: true,
			},
			{ name: "Modpack", value: server.modpack || "vanilla", inline: true },
			{ name: "Port", value: server.port?.toString() || "N/A", inline: true }
		);

	await interaction.editReply({ embeds: [embed] });
}

async function handleStartWithMenu(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const { data, error } = await gameServers.get();
	if (error || !data) {
		await interaction.editReply(
			`Failed to list servers: ${String(error?.value) || "Unknown error"}`
		);
		return;
	}

	const servers = data;
	const stopped = servers.filter((s) => s.status === "stopped");
	if (stopped.length === 0) {
		await interaction.editReply("No stopped servers to start.");
		return;
	}

	const select = new StringSelectMenuBuilder()
		.setCustomId("start-server")
		.setPlaceholder("Select a server to start")
		.addOptions(
			stopped.map((s) =>
				new StringSelectMenuOptionBuilder()
					.setLabel(s.name)
					.setDescription(s.modpack || "vanilla")
					.setValue(s.name)
			)
		);

	const row = new ActionRowBuilder().addComponents(select);
	await interaction.editReply({ content: "Which server?", components: [row] });

	const message = await interaction.fetchReply();
	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		time: 60_000,
	});

	collector.on("collect", async (menu) => {
		const selected = selectMenuValueSchema.safeParse(menu.values[0]);
		if (!selected.success) {
			await menu.reply({
				content: `invalid selection: ${selected.error.issues.map((i) => i.message).join(", ")}`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		const serverName = selected.data;
		await menu.deferUpdate();

		const { error: startError } = await gameServers({
			name: serverName,
		}).start.post();
		if (startError) {
			await interaction.editReply({
				content: `Failed to start: ${startError.value}`,
				components: [],
			});
		} else {
			await interaction.editReply({
				content: `Starting **${serverName}**...`,
				components: [],
			});
		}
		collector.stop("handled");
	});

	collector.on("end", async (_, reason) => {
		if (reason !== "handled") {
			await interaction.editReply({ content: "Timed out.", components: [] });
		}
	});
}

async function handleStopWithMenu(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const { data, error } = await gameServers.get();
	if (error || !data) {
		await interaction.editReply(
			`Failed to list servers: ${String(error?.value) || "Unknown error"}`
		);
		return;
	}

	const servers = data;
	const running = servers.filter((s) => s.status === "running");
	if (running.length === 0) {
		await interaction.editReply("No running servers to stop.");
		return;
	}

	const select = new StringSelectMenuBuilder()
		.setCustomId("stop-server")
		.setPlaceholder("Select a server to stop")
		.addOptions(
			running.map((s) =>
				new StringSelectMenuOptionBuilder()
					.setLabel(s.name)
					.setDescription(s.modpack || "vanilla")
					.setValue(s.name)
			)
		);

	const row = new ActionRowBuilder().addComponents(select);
	await interaction.editReply({ content: "Which server?", components: [row] });

	const message = await interaction.fetchReply();
	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		time: 60_000,
	});

	collector.on("collect", async (menu) => {
		const selected = selectMenuValueSchema.safeParse(menu.values[0]);
		if (!selected.success) {
			await menu.reply({
				content: `invalid selection: ${selected.error.issues.map((i) => i.message).join(", ")}`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		const serverName = selected.data;
		await menu.deferUpdate();

		const { error: stopError } = await gameServers({
			name: serverName,
		}).stop.post();
		if (stopError) {
			await interaction.editReply({
				content: `Failed to stop: ${stopError.value}`,
				components: [],
			});
		} else {
			await interaction.editReply({
				content: `Stopping **${serverName}**...`,
				components: [],
			});
		}
		collector.stop("handled");
	});

	collector.on("end", async (_, reason) => {
		if (reason !== "handled") {
			await interaction.editReply({ content: "Timed out.", components: [] });
		}
	});
}

async function handleDelete(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const nameResult = serverNameSchema.safeParse(interaction.options.getString("name", true));
	if (!nameResult.success) {
		await interaction.editReply(
			`invalid input:\n${nameResult.error.issues.map((i) => i.message).join("\n")}`
		);
		return;
	}
	const name = nameResult.data;
	const { error } = await gameServers({ name }).delete();

	if (error) {
		await interaction.editReply(`Failed to delete server: ${error.value}`);
		return;
	}

	await interaction.editReply(`Deleted **${name}**.`);
}

function statusEmoji(status: GameServerType["status"]): string {
	switch (status) {
		case "running":
			return "🟢";
		case "stopped":
			return "🔴";
		case "starting":
			return "🟡";
		case "stopping":
			return "🟠";
		case "error":
			return "❌";
		default:
			return "⚪";
	}
}

function statusColor(status: GameServerType["status"]): number {
	switch (status) {
		case "running":
			return 0x57f287;
		case "stopped":
			return 0xed4245;
		case "starting":
			return 0xfee75c;
		case "stopping":
			return 0xe67e22;
		case "error":
			return 0xed4245;
		default:
			return 0x95a5a6;
	}
}
