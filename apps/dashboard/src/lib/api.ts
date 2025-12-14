import { treaty } from "@elysiajs/eden";
import type { App } from "@nexus/app";

// Use same origin in production (served by Nexus), localhost in dev
const API_URL =
	import.meta.env.VITE_API_URL ||
	(typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export const client = treaty<App>(API_URL);
