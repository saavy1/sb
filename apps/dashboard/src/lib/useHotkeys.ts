import { useEffect } from "react";

type KeyCombo = string;
type HotkeyCallback = (event: KeyboardEvent) => void;

interface HotkeyOptions {
	enabled?: boolean;
	preventDefault?: boolean;
	ignoreInputs?: boolean;
}

function isEditableElement(element: Element | null): boolean {
	if (!element) return false;
	const tagName = element.tagName.toLowerCase();
	if (tagName === "input" || tagName === "textarea" || tagName === "select") {
		return true;
	}
	if (element.getAttribute("contenteditable") === "true") {
		return true;
	}
	return false;
}

function parseKeyCombo(combo: string): {
	key: string;
	meta: boolean;
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
} {
	const parts = combo.toLowerCase().split("+");
	const key = parts[parts.length - 1];
	return {
		key,
		meta: parts.includes("meta") || parts.includes("cmd"),
		ctrl: parts.includes("ctrl"),
		shift: parts.includes("shift"),
		alt: parts.includes("alt"),
	};
}

function matchesCombo(event: KeyboardEvent, combo: ReturnType<typeof parseKeyCombo>): boolean {
	const eventKey = event.key.toLowerCase();
	return (
		eventKey === combo.key &&
		event.metaKey === combo.meta &&
		event.ctrlKey === combo.ctrl &&
		event.shiftKey === combo.shift &&
		event.altKey === combo.alt
	);
}

export function useHotkey(
	keyCombo: KeyCombo,
	callback: HotkeyCallback,
	options: HotkeyOptions = {}
): void {
	const { enabled = true, preventDefault = true, ignoreInputs = true } = options;

	useEffect(() => {
		if (!enabled) return;

		const combo = parseKeyCombo(keyCombo);

		const handler = (event: KeyboardEvent) => {
			if (ignoreInputs && isEditableElement(document.activeElement)) {
				return;
			}
			if (matchesCombo(event, combo)) {
				if (preventDefault) {
					event.preventDefault();
				}
				callback(event);
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [keyCombo, callback, enabled, preventDefault, ignoreInputs]);
}

export function useHotkeys(
	hotkeys: Record<KeyCombo, HotkeyCallback>,
	options: HotkeyOptions = {}
): void {
	const { enabled = true, preventDefault = true, ignoreInputs = true } = options;

	useEffect(() => {
		if (!enabled) return;

		const combos = Object.entries(hotkeys).map(([keyCombo, callback]) => ({
			combo: parseKeyCombo(keyCombo),
			callback,
		}));

		const handler = (event: KeyboardEvent) => {
			if (ignoreInputs && isEditableElement(document.activeElement)) {
				return;
			}
			for (const { combo, callback } of combos) {
				if (matchesCombo(event, combo)) {
					if (preventDefault) {
						event.preventDefault();
					}
					callback(event);
					break;
				}
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [hotkeys, enabled, preventDefault, ignoreInputs]);
}
