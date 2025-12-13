import { z } from "zod";

export const serverNameSchema = z
  .string()
  .trim()
  .min(1, "server name is required")
  .max(64, "server name is too long");

export const modpackSlugSchema = z
  .string()
  .trim()
  .min(1, "modpack slug is required")
  .max(128, "modpack slug is too long");

export const selectMenuValueSchema = z
  .string()
  .trim()
  .min(1, "selection is required")
  .max(256, "selection is too long");


