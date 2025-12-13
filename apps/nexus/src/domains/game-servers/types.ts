import { t } from "elysia";

export const GameServerStatus = t.Union([
	t.Literal("stopped"),
	t.Literal("starting"),
	t.Literal("running"),
	t.Literal("stopping"),
	t.Literal("error"),
]);

export const GameServer = t.Object({
	id: t.String(),
	name: t.String(),
	gameType: t.Literal("minecraft"),
	modpack: t.Optional(t.String()),
	status: GameServerStatus,
	port: t.Optional(t.Number()),
	createdBy: t.String(),
	createdAt: t.String(),
	memory: t.Optional(t.String()),
	k8sDeployment: t.Optional(t.String()),
});

export const CreateServerRequest = t.Object({
	name: t.String({ minLength: 1, maxLength: 32, pattern: "^[a-z0-9-]+$" }),
	modpack: t.String({ minLength: 1 }),
	createdBy: t.String(),
	memory: t.Optional(t.String()),
});

export const ServerNameParam = t.Object({
	name: t.String(),
});

export const ApiError = t.Object({
	error: t.String(),
});

export type GameServerType = typeof GameServer.static;
export type GameServerStatusType = typeof GameServerStatus.static;
export type CreateServerRequestType = typeof CreateServerRequest.static;
