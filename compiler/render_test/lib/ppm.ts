// @ts-nocheck
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

export function writePPM(path: string, fb: Uint8Array, w: number, h: number) {
	const header = `P6\n${w} ${h}\n255\n`;
	const headerBytes = new TextEncoder().encode(header);
	const out = new Uint8Array(headerBytes.length + fb.length);
	out.set(headerBytes, 0);
	out.set(fb, headerBytes.length);
	writeFileSync(path, out);
}

export function writeBMP(path: string, fb: Uint8Array, w: number, h: number) {
	const rowSize = ((w * 3 + 3) & ~3);
	const pixelSize = rowSize * h;
	const fileSize = 54 + pixelSize;
	const buf = new Uint8Array(fileSize);
	const v = new DataView(buf.buffer);

	buf[0] = 0x42; buf[1] = 0x4D;
	v.setUint32(2, fileSize, true);
	v.setUint32(10, 54, true);
	v.setUint32(14, 40, true);
	v.setInt32(18, w, true);
	v.setInt32(22, -h, true);
	v.setUint16(26, 1, true);
	v.setUint16(28, 24, true);
	v.setUint32(34, pixelSize, true);

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const si = (y * w + x) * 3;
			const di = 54 + y * rowSize + x * 3;
			buf[di] = fb[si + 2];
			buf[di + 1] = fb[si + 1];
			buf[di + 2] = fb[si];
		}
	}

	writeFileSync(path, buf);
}

export function writePNG(path: string, fb: Uint8Array, w: number, h: number) {
	// Minimal PNG encoder (RGB, 8-bit, no interlacing)
	// PNG signature
	const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

	// --- IHDR chunk ---
	const ihdr = new Uint8Array(13);
	const ihdrView = new DataView(ihdr.buffer);
	ihdrView.setUint32(0, w);       // width
	ihdrView.setUint32(4, h);       // height
	ihdr[8] = 8;                     // bit depth
	ihdr[9] = 2;                     // color type: RGB
	ihdr[10] = 0;                    // compression
	ihdr[11] = 0;                    // filter
	ihdr[12] = 0;                    // interlace
	const ihdrChunk = pngChunk('IHDR', ihdr);

	// --- IDAT chunk ---
	// Build raw image data: filter byte (0) + row pixels for each row
	const rawLen = h * (1 + w * 3);
	const raw = new Uint8Array(rawLen);
	let offset = 0;
	for (let y = 0; y < h; y++) {
		raw[offset++] = 0; // filter: None
		for (let x = 0; x < w; x++) {
			const si = (y * w + x) * 3;
			raw[offset++] = fb[si];     // R
			raw[offset++] = fb[si + 1]; // G
			raw[offset++] = fb[si + 2]; // B
		}
	}
	const compressed = deflateSync(raw);
	const idatChunk = pngChunk('IDAT', compressed);

	// --- IEND chunk ---
	const iendChunk = pngChunk('IEND', new Uint8Array(0));

	// Assemble
	const totalLen = signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
	const out = new Uint8Array(totalLen);
	let pos = 0;
	out.set(signature, pos); pos += signature.length;
	out.set(ihdrChunk, pos); pos += ihdrChunk.length;
	out.set(idatChunk, pos); pos += idatChunk.length;
	out.set(iendChunk, pos);

	writeFileSync(path, out);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const buf = new Uint8Array(4 + 4 + data.length + 4);
	const view = new DataView(buf.buffer);

	// Length (4 bytes, big-endian)
	view.setUint32(0, data.length);

	// Type (4 ASCII bytes)
	for (let i = 0; i < 4; i++) buf[4 + i] = type.charCodeAt(i);

	// Data
	buf.set(data, 8);

	// CRC32 over type + data
	const crc = crc32(buf.subarray(4, 8 + data.length));
	view.setUint32(8 + data.length, crc);

	return buf;
}

// CRC32 lookup table
const crcTable = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		}
		table[n] = c;
	}
	return table;
})();

function crc32(data: Uint8Array): number {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < data.length; i++) {
		crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}
