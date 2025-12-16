interface SparklineProps {
	data: number[];
	width?: number;
	height?: number;
	color?: string;
	className?: string;
}

export function Sparkline({
	data,
	width = 60,
	height = 20,
	color = "var(--accent)",
	className,
}: SparklineProps) {
	if (data.length < 2) return null;

	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;

	const points = data.map((value, index) => {
		const x = (index / (data.length - 1)) * width;
		const y = height - ((value - min) / range) * height;
		return `${x},${y}`;
	});

	const pathD = `M ${points.join(" L ")}`;

	return (
		<svg
			width={width}
			height={height}
			className={className}
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label="Sparkline chart"
		>
			<path
				d={pathD}
				fill="none"
				stroke={color}
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

interface SparklineBarProps {
	value: number;
	max?: number;
	width?: number;
	height?: number;
	color?: string;
	className?: string;
}

export function SparklineBar({
	value,
	max = 100,
	width = 40,
	height = 16,
	color,
	className,
}: SparklineBarProps) {
	const percentage = Math.min(100, Math.max(0, (value / max) * 100));
	const barColor =
		color ||
		(percentage > 90 ? "var(--error)" : percentage > 70 ? "var(--warning)" : "var(--accent)");

	return (
		<svg
			width={width}
			height={height}
			className={className}
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={`Progress bar at ${Math.round(percentage)}%`}
		>
			<rect x={0} y={0} width={width} height={height} rx={2} fill="var(--border)" />
			<rect x={0} y={0} width={(percentage / 100) * width} height={height} rx={2} fill={barColor} />
		</svg>
	);
}
