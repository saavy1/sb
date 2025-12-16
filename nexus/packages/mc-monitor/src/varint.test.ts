import { describe, expect, test } from "bun:test";
import { decodeVarInt, encodeVarInt, varIntLength } from "./varint";

describe("encodeVarInt", () => {
	test("encodes single-byte values (0-127)", () => {
		expect(encodeVarInt(0)).toEqual(new Uint8Array([0x00]));
		expect(encodeVarInt(1)).toEqual(new Uint8Array([0x01]));
		expect(encodeVarInt(127)).toEqual(new Uint8Array([0x7f]));
	});

	test("encodes two-byte values (128-16383)", () => {
		expect(encodeVarInt(128)).toEqual(new Uint8Array([0x80, 0x01]));
		expect(encodeVarInt(255)).toEqual(new Uint8Array([0xff, 0x01]));
		expect(encodeVarInt(16383)).toEqual(new Uint8Array([0xff, 0x7f]));
	});

	test("encodes three-byte values", () => {
		expect(encodeVarInt(16384)).toEqual(new Uint8Array([0x80, 0x80, 0x01]));
		expect(encodeVarInt(2097151)).toEqual(new Uint8Array([0xff, 0xff, 0x7f]));
	});

	test("encodes protocol version 767 (1.21.x)", () => {
		// 767 = 0x2FF = 0b10_1111111 -> [0xFF, 0x05]
		expect(encodeVarInt(767)).toEqual(new Uint8Array([0xff, 0x05]));
	});

	test("encodes max 32-bit value", () => {
		expect(encodeVarInt(2147483647)).toEqual(
			new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x07])
		);
	});
});

describe("decodeVarInt", () => {
	test("decodes single-byte values", () => {
		expect(decodeVarInt(new Uint8Array([0x00]))).toEqual({ value: 0, bytesRead: 1 });
		expect(decodeVarInt(new Uint8Array([0x01]))).toEqual({ value: 1, bytesRead: 1 });
		expect(decodeVarInt(new Uint8Array([0x7f]))).toEqual({ value: 127, bytesRead: 1 });
	});

	test("decodes two-byte values", () => {
		expect(decodeVarInt(new Uint8Array([0x80, 0x01]))).toEqual({ value: 128, bytesRead: 2 });
		expect(decodeVarInt(new Uint8Array([0xff, 0x01]))).toEqual({ value: 255, bytesRead: 2 });
		expect(decodeVarInt(new Uint8Array([0xff, 0x7f]))).toEqual({ value: 16383, bytesRead: 2 });
	});

	test("decodes with offset", () => {
		const buffer = new Uint8Array([0x00, 0x00, 0xff, 0x05, 0x00]);
		expect(decodeVarInt(buffer, 2)).toEqual({ value: 767, bytesRead: 2 });
	});

	test("throws on empty buffer", () => {
		expect(() => decodeVarInt(new Uint8Array([]))).toThrow("VarInt is too short");
	});

	test("throws on incomplete varint", () => {
		// 0x80 has continuation bit set but no next byte
		expect(() => decodeVarInt(new Uint8Array([0x80]))).toThrow("VarInt is too short");
	});

	test("throws on varint > 5 bytes", () => {
		// All continuation bits set for 5+ bytes
		expect(() =>
			decodeVarInt(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x01]))
		).toThrow("VarInt is too big");
	});
});

describe("varIntLength", () => {
	test("returns correct byte length", () => {
		expect(varIntLength(0)).toBe(1);
		expect(varIntLength(127)).toBe(1);
		expect(varIntLength(128)).toBe(2);
		expect(varIntLength(16383)).toBe(2);
		expect(varIntLength(16384)).toBe(3);
		expect(varIntLength(2097151)).toBe(3);
		expect(varIntLength(2097152)).toBe(4);
		expect(varIntLength(2147483647)).toBe(5);
	});
});

describe("encode/decode roundtrip", () => {
	test("roundtrips various values", () => {
		const testValues = [0, 1, 127, 128, 255, 767, 16383, 16384, 2097151, 2147483647];
		for (const value of testValues) {
			const encoded = encodeVarInt(value);
			const decoded = decodeVarInt(encoded);
			expect(decoded.value).toBe(value);
			expect(decoded.bytesRead).toBe(encoded.length);
		}
	});
});
