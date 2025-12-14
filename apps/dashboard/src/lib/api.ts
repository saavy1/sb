import { treaty } from "@elysiajs/eden";
import type { App } from "@nexus/app";

// Use same origin in production (served by Nexus), localhost:3000 in dev
export const API_URL =
	import.meta.env.VITE_API_URL ||
	(import.meta.env.MODE === "production" ? window.location.origin : "http://localhost:3000");

export const client = treaty<App>(API_URL);
