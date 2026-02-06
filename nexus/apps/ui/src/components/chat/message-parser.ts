export type ContentSegment =
  | { type: "text"; content: string; key: string }
  | { type: "tool-result"; result: Record<string, unknown>; key: string }
  | { type: "tool-error"; error: string; toolName?: string; key: string };

export function parseMessageContent(content: string): ContentSegment[] {
  // Clean DeepSeek tool call markers
  const cleaned = content
    .replace(/<｜tool▁calls▁begin｜>[\s\S]*?<｜tool▁calls▁end｜>/g, "")
    .replace(/<｜tool▁call▁begin｜>[\s\S]*?<｜tool▁call▁end｜>/g, "")
    .replace(/```json\s*\{\s*\}\s*```/g, "");

  const segments: ContentSegment[] = [];
  let segmentIndex = 0;

  // Pattern to match JSON objects at the start of lines or after newlines
  const jsonPattern = /(?:^|\n)\s*(\{[\s\S]*?\})\s*(?=\n|$)/g;

  let lastIndex = 0;
  let match = jsonPattern.exec(cleaned);

  while (match !== null) {
    const jsonStr = match[1];

    try {
      const parsed = JSON.parse(jsonStr);

      const textBefore = cleaned.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        segments.push({
          type: "text",
          content: textBefore.trim(),
          key: `text-${segmentIndex++}`,
        });
      }

      if (parsed.error && typeof parsed.error === "string") {
        const toolMatch = parsed.error.match(/tool (\w+):/);
        segments.push({
          type: "tool-error",
          error: parsed.error,
          toolName: toolMatch?.[1],
          key: `error-${segmentIndex++}`,
        });
      } else {
        segments.push({
          type: "tool-result",
          result: parsed,
          key: `result-${segmentIndex++}`,
        });
      }

      lastIndex = match.index + match[0].length;
    } catch {
      // Not valid JSON, skip
    }

    match = jsonPattern.exec(cleaned);
  }

  const remaining = cleaned.slice(lastIndex).trim();
  if (remaining) {
    segments.push({
      type: "text",
      content: remaining,
      key: `text-${segmentIndex++}`,
    });
  }

  if (segments.length === 0 && cleaned.trim()) {
    segments.push({ type: "text", content: cleaned.trim(), key: "text-0" });
  }

  return segments;
}

export function generateResultSummary(result: Record<string, unknown>): string {
  if ("results" in result && Array.isArray(result.results)) {
    const count = result.results.length;
    const firstTitle = result.results[0]?.title || result.results[0]?.name;
    if (firstTitle) {
      return `Found ${count} result${count !== 1 ? "s" : ""}: "${firstTitle}"${count > 1 ? "..." : ""}`;
    }
    return `Found ${count} result${count !== 1 ? "s" : ""}`;
  }

  if (
    "status" in result &&
    "media" in result &&
    typeof result.media === "object"
  ) {
    const media = result.media as Record<string, unknown>;
    const title = media.title || media.name || "media";
    const status = result.status;
    const seasons = Array.isArray(media.seasons) ? media.seasons.length : 0;
    if (seasons > 0) {
      return `${title}: ${status} (${seasons} seasons)`;
    }
    return `${title}: ${status}`;
  }

  if ("seasons" in result && Array.isArray(result.seasons)) {
    const title = result.name || result.title || "Show";
    const seasonCount = result.seasons.length;
    return `${title}: ${seasonCount} season${seasonCount !== 1 ? "s" : ""}`;
  }

  if ("success" in result) {
    if (result.success === false && result.error) {
      return `Failed: ${String(result.error).slice(0, 50)}`;
    }
    if (result.message) {
      return String(result.message).slice(0, 60);
    }
  }

  if (Array.isArray(result)) {
    return `${result.length} item${result.length !== 1 ? "s" : ""}`;
  }

  const keys = Object.keys(result).slice(0, 3);
  return `Result: {${keys.join(", ")}${Object.keys(result).length > 3 ? "..." : ""}}`;
}
