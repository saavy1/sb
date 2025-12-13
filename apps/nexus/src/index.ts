import { config } from "./infra/config";
import { app } from "./app";

const server = app.listen(config.PORT);

console.log(
  `Homelab API running at http://${server.server?.hostname}:${server.server?.port}`
);
console.log(`OpenAPI docs at http://${server.server?.hostname}:${server.server?.port}/openapi`);
