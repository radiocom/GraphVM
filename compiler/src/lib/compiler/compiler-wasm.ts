import { compileIR } from './ir-compiler';
import { dslToIR } from './dsl-compiler';

export function compile(text: string): Uint8Array {
	const ir = dslToIR(text);
	return compileIR(ir);
}

export function bytecodeToHex(code: Uint8Array): string {
	return Array.from(code)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join(' ');
}

export function extractTextChars(dslText: string): string[] {
	const chars = new Set<string>();
	for (const raw of dslText.split('\n')) {
		const trimmed = raw.replace(/;.*$/, '').trim();
		if (!trimmed) continue;
		const parts = trimmed.split(/\s+/);
		const op = parts[0].toUpperCase();
		if (op === 'TEXT' && parts.length >= 4) {
			const content = parts
				.slice(3)
				.join(' ')
				.replace(/^"/, '')
				.replace(/"$/, '');
			for (const ch of content) {
				if (ch.trim().length > 0) chars.add(ch);
			}
		}
	}
	return [...chars].sort();
}

export function parseColor(s: string): number {
	if (s.startsWith('#')) {
		const hex = s.slice(1);
		if (hex.length === 6) return parseInt(hex, 16);
		if (hex.length === 3) {
			const r = parseInt(hex[0] + hex[0], 16);
			const g = parseInt(hex[1] + hex[1], 16);
			const b = parseInt(hex[2] + hex[2], 16);
			return (r << 16) | (g << 8) | b;
		}
	}
	const named: Record<string, number> = {
		black: 0x000000, white: 0xffffff, red: 0xff0000, green: 0x00ff00,
		blue: 0x0000ff, yellow: 0xffff00, cyan: 0x00ffff, magenta: 0xff00ff,
		gray: 0x808080, grey: 0x808080, orange: 0xffa500, purple: 0x800080,
		pink: 0xffc0cb, brown: 0xa52a2a, none: -1
	};
	return named[s.toLowerCase()] ?? 0x000000;
}
