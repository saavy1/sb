// Export only the app type for Eden clients
// This file intentionally avoids importing Bun-specific modules
import type { app } from "./app";

export type App = typeof app;
