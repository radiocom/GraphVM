const VM_FONT_MAGIC_0 = 0x47;
const VM_FONT_MAGIC_1 = 0x46;

interface GlyphData {
	codepoint: number;
	width: number;
	height: number;
	advance_x: number;
	bearing_x: number;
	bearing_y: number;
	rle: Uint8Array;
}

function rleEncode(pixels: Uint8Array): Uint8Array {
	if (pixels.length === 0) return new Uint8Array(0);

	const out: number[] = [];
	let current = pixels[0];
	let count = 1;

	for (let i = 1; i < pixels.length; i++) {
		if (pixels[i] === current && count < 255) {
			count++;
		} else {
			out.push(count, current);
			current = pixels[i];
			count = 1;
		}
	}
	out.push(count, current);
	return new Uint8Array(out);
}

function renderGlyph(
	char: string,
	fontSize: number,
	fontFamily: string
): GlyphData | null {
	const codepoint = char.codePointAt(0);
	if (codepoint === undefined) return null;

	const padding = 4;
	const canvasSize = fontSize * 3;
	const canvas = new OffscreenCanvas(canvasSize, canvasSize);
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.fillStyle = 'black';
	ctx.fillRect(0, 0, canvasSize, canvasSize);

	ctx.font = `${fontSize}px "${fontFamily}", sans-serif`;
	ctx.fillStyle = 'white';
	ctx.textBaseline = 'alphabetic';

	const metrics = ctx.measureText(char);
	const advance_x = Math.ceil(metrics.width);
	const ascent = Math.ceil(metrics.actualBoundingBoxAscent);
	const descent = Math.ceil(metrics.actualBoundingBoxDescent);
	const left = Math.floor(metrics.actualBoundingBoxLeft);
	const right = Math.ceil(metrics.actualBoundingBoxRight);

	const glyph_w = left + right + padding;
	const glyph_h = ascent + descent + padding;

	if (glyph_w <= 0 || glyph_h <= 0) {
		return {
			codepoint,
			width: 0,
			height: 0,
			advance_x: advance_x || Math.ceil(fontSize * 0.5),
			bearing_x: 0,
			bearing_y: 0,
			rle: new Uint8Array(0)
		};
	}

	const renderCanvas = new OffscreenCanvas(glyph_w, glyph_h);
	const rctx = renderCanvas.getContext('2d');
	if (!rctx) return null;

	rctx.fillStyle = 'black';
	rctx.fillRect(0, 0, glyph_w, glyph_h);

	rctx.font = `${fontSize}px "${fontFamily}", sans-serif`;
	rctx.fillStyle = 'white';
	rctx.textBaseline = 'alphabetic';

	const drawX = left + padding / 2;
	const drawY = ascent + padding / 2;
	rctx.fillText(char, drawX, drawY);

	const imageData = rctx.getImageData(0, 0, glyph_w, glyph_h);
	const pixels = new Uint8Array(glyph_w * glyph_h);

	for (let i = 0; i < glyph_w * glyph_h; i++) {
		pixels[i] = imageData.data[i * 4] > 127 ? 0xff : 0x00;
	}

	let minX = glyph_w,
		maxX = 0,
		minY = glyph_h,
		maxY = 0;
	let hasPixels = false;
	for (let y = 0; y < glyph_h; y++) {
		for (let x = 0; x < glyph_w; x++) {
			if (pixels[y * glyph_w + x]) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
				hasPixels = true;
			}
		}
	}

	if (!hasPixels) {
		return {
			codepoint,
			width: 0,
			height: 0,
			advance_x: advance_x || Math.ceil(fontSize * 0.3),
			bearing_x: 0,
			bearing_y: 0,
			rle: new Uint8Array(0)
		};
	}

	const trimW = maxX - minX + 1;
	const trimH = maxY - minY + 1;
	const trimmed = new Uint8Array(trimW * trimH);
	for (let y = 0; y < trimH; y++) {
		for (let x = 0; x < trimW; x++) {
			trimmed[y * trimW + x] = pixels[(minY + y) * glyph_w + (minX + x)];
		}
	}

	const bearing_x = minX - (left + padding / 2);
	const bearing_y = (ascent + padding / 2) - minY;

	return {
		codepoint,
		width: trimW,
		height: trimH,
		advance_x,
		bearing_x,
		bearing_y,
		rle: rleEncode(trimmed)
	};
}

export function extractUsedChars(text: string): string[] {
	const chars = new Set<string>();
	for (const ch of text) {
		if (ch.trim().length > 0) chars.add(ch);
	}
	return [...chars].sort();
}

export function compileFontResource(
	chars: string[],
	fontSize: number,
	fontFamily: string = 'monospace'
): Uint8Array {
	const glyphs: GlyphData[] = [];

	for (const ch of chars) {
		const g = renderGlyph(ch, fontSize, fontFamily);
		if (g) glyphs.push(g);
	}

	const headerSize = 7;
	const entrySize = 13;
	const tableSize = glyphs.length * entrySize;

	let totalRleSize = 0;
	for (const g of glyphs) {
		totalRleSize += g.rle.length;
	}

	const totalSize = headerSize + tableSize + totalRleSize;
	const buf = new Uint8Array(totalSize);
	const view = new DataView(buf.buffer);

	buf[0] = VM_FONT_MAGIC_0;
	buf[1] = VM_FONT_MAGIC_1;
	buf[2] = fontSize;
	view.setUint16(3, glyphs.length, true);
	view.setUint16(5, totalRleSize, true);

	let dataOffset = 0;
	for (let i = 0; i < glyphs.length; i++) {
		const g = glyphs[i];
		const off = headerSize + i * entrySize;

		view.setUint32(off, g.codepoint, true);
		buf[off + 4] = g.width;
		buf[off + 5] = g.height;
		buf[off + 6] = g.advance_x;
		buf[off + 7] = g.bearing_x & 0xff;
		buf[off + 8] = g.bearing_y & 0xff;
		view.setUint16(off + 9, dataOffset, true);
		view.setUint16(off + 11, g.rle.length, true);

		buf.set(g.rle, headerSize + tableSize + dataOffset);
		dataOffset += g.rle.length;
	}

	return buf;
}
