/**
 * VarInt encoding/decoding for Minecraft protocol.
 * VarInts are 1-5 bytes, using 7 bits per byte with MSB as continuation flag.
 * See: https://wiki.vg/Protocol#VarInt_and_VarLong
 */

const SEGMENT_BITS = 0x7f;
const CONTINUE_BIT = 0x80;

/**
 * Encode a number as a VarInt
 */
export function encodeVarInt(value: number): Uint8Array {
	const bytes: number[] = [];
	while (true) {
		if ((value & ~SEGMENT_BITS) === 0) {
			bytes.push(value);
			break;
		}
		bytes.push((value & SEGMENT_BITS) | CONTINUE_BIT);
		value >>>= 7;
	}
	return new Uint8Array(bytes);
}

/**
 * Decode a VarInt from a buffer, returning the value and bytes consumed
 */
export function decodeVarInt(buffer: Uint8Array, offset = 0): { value: number; bytesRead: number } {
	let value = 0;
	let position = 0;
	let bytesRead = 0;

	while (true) {
		if (offset + bytesRead >= buffer.length) {
			throw new Error("VarInt is too short");
		}
		const currentByte = buffer[offset + bytesRead]!;
		value |= (currentByte & SEGMENT_BITS) << position;
		bytesRead++;

		if ((currentByte & CONTINUE_BIT) === 0) {
			break;
		}

		position += 7;
		if (position >= 32) {
			throw new Error("VarInt is too big");
		}
	}

	return { value, bytesRead };
}

/**
 * Calculate the byte length of a VarInt
 */
export function varIntLength(value: number): number {
	let len = 0;
	do {
		len++;
		value >>>= 7;
	} while (value !== 0);
	return len;
}
