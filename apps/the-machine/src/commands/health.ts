import {
  ChatInputCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { client } from "../api";
import { config } from "../config";

export const healthCommand = new ChatInputCommandBuilder()
  .setName("health")
  .setDescription("Check bot and API health");

export async function handleHealthCommand(
  interaction: ChatInputCommandInteraction
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { data, error } = await client.health.get();

  const embed = new EmbedBuilder()
    .setTitle("Health Check")
    .setColor(data ? 0x57f287 : 0xed4245)
    .addFields(
      { name: "Bot", value: "🟢 Online", inline: true },
      {
        name: "Elysia API",
        value: data ? "🟢 Connected" : `🔴 ${error?.value || "Unreachable"}`,
        inline: true,
      },
      { name: "API URL", value: config.ELYSIA_API_URL, inline: false }
    );

  await interaction.editReply({ embeds: [embed] });
}
