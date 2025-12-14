import { createFileRoute } from "@tanstack/react-router";
import { Chat } from "../components/Chat";

export const Route = createFileRoute("/chat")({
	component: ChatPage,
});

function ChatPage() {
	return (
		<div className="flex h-[calc(100vh-4rem)] flex-col">
			<div className="border-b border-zinc-800 px-6 py-4">
				<h1 className="text-2xl font-bold text-white">The Machine</h1>
				<p className="text-sm text-zinc-400">AI assistant for your homelab</p>
			</div>
			<div className="flex-1 overflow-hidden">
				<Chat />
			</div>
		</div>
	);
}
