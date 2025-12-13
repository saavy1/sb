import { z } from "zod";

export const configSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  ELYSIA_API_URL: z.string().url().default("http://localhost:3000"),
  ELYSIA_API_KEY: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;
