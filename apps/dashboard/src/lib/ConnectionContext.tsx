import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface ConnectionContextValue {
	connected: boolean;
	systemInfo: SystemOverview | null;
	cpuHistory: number[];
	memHistory: number[];
}

type SystemOverview = {
	stats?: {
		cpu: { usage: number };
		gpu?: { available: boolean; usage: number };
		memory: { usagePercent: number };
		disk: { readSpeed: number; writeSpeed: number };
		network: {
			totalRxSpeed: number;
			totalTxSpeed: number;
			interfaces: Array<{ name: string; rxSpeed: number; txSpeed: number }>;
		};
		uptime: { seconds: number; formatted: string };
	};
	drives?: Array<{
		id: string;
		label: string;
		path: string;
		mounted: boolean;
		total?: number;
		used?: number;
		usagePercent?: number;
	}>;
	databases?: Array<{
		name: string;
		domain: string;
		sizeBytes: number;
		sizeFormatted: string;
	}>;
};

const ConnectionContext = createContext<ConnectionContextValue>({
	connected: false,
	systemInfo: null,
	cpuHistory: [],
	memHistory: [],
});

const WS_URL =
	import.meta.env.VITE_API_URL?.replace(/^http/, "ws") ||
	(import.meta.env.MODE === "production"
		? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
		: "ws://localhost:3000");

export function ConnectionProvider({ children }: { children: ReactNode }) {
	const [connected, setConnected] = useState(false);
	const [systemInfo, setSystemInfo] = useState<SystemOverview | null>(null);
	const [cpuHistory, setCpuHistory] = useState<number[]>([]);
	const [memHistory, setMemHistory] = useState<number[]>([]);
	const wsRef = useRef<WebSocket | null>(null);
	const wasConnected = useRef(false);
	const intentionalClose = useRef(false);

	useEffect(() => {
		intentionalClose.current = false;

		const connect = () => {
			const ws = new WebSocket(`${WS_URL}/api/systemInfo/live`);
			wsRef.current = ws;
			ws.onopen = () => {
				setConnected(true);
				if (wasConnected.current) {
					toast.success("Connection restored");
				}
				wasConnected.current = true;
			};
			ws.onmessage = (e) => {
				try {
					const data = JSON.parse(e.data);
					setSystemInfo(data);
					if (data.stats?.cpu?.usage !== undefined) {
						setCpuHistory((prev) => [...prev.slice(-19), data.stats.cpu.usage]);
					}
					if (data.stats?.memory?.usagePercent !== undefined) {
						setMemHistory((prev) => [...prev.slice(-19), data.stats.memory.usagePercent]);
					}
				} catch (error) {
					console.error("Failed to parse system info:", error);
				}
			};
			ws.onclose = () => {
				if (wasConnected.current && !intentionalClose.current) {
					toast.error("Connection lost", { description: "Reconnecting..." });
				}
				setConnected(false);
				if (!intentionalClose.current) {
					setTimeout(connect, 2000);
				}
			};
			ws.onerror = () => ws.close();
		};
		connect();
		return () => {
			intentionalClose.current = true;
			wsRef.current?.close();
		};
	}, []);

	return (
		<ConnectionContext.Provider value={{ connected, systemInfo, cpuHistory, memHistory }}>
			{children}
		</ConnectionContext.Provider>
	);
}

export function useConnection() {
	return useContext(ConnectionContext);
}
