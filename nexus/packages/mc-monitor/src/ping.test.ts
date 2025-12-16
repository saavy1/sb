import { describe, expect, test } from "bun:test";
import { parseDescription } from "./ping";

describe("parseDescription", () => {
	test("handles plain string description", () => {
		expect(parseDescription("A Minecraft Server")).toBe("A Minecraft Server");
	});

	test("handles empty string", () => {
		expect(parseDescription("")).toBe("");
	});

	test("handles simple text object", () => {
		expect(parseDescription({ text: "Welcome to the server!" })).toBe(
			"Welcome to the server!"
		);
	});

	test("handles text object with empty text", () => {
		expect(parseDescription({ text: "" })).toBe("");
	});

	test("handles text object with extra components", () => {
		expect(
			parseDescription({
				text: "Hello ",
				extra: [{ text: "World" }, { text: "!" }],
			})
		).toBe("Hello World!");
	});

	test("handles text object with empty extra", () => {
		expect(
			parseDescription({
				text: "Just text",
				extra: [],
			})
		).toBe("Just text");
	});

	test("handles extra with missing text", () => {
		expect(
			parseDescription({
				text: "Base",
				extra: [{ text: "" }, { text: " suffix" }],
			})
		).toBe("Base suffix");
	});

	test("handles object without text property", () => {
		// Edge case: object has extra but no text
		expect(parseDescription({} as never)).toBe("");
	});

	test("handles typical Minecraft MOTD", () => {
		// Real-world example: colored MOTD with multiple parts
		expect(
			parseDescription({
				text: "",
				extra: [
					{ text: "Welcome to " },
					{ text: "Superbloom" },
					{ text: " - Modded Minecraft" },
				],
			})
		).toBe("Welcome to Superbloom - Modded Minecraft");
	});
});
