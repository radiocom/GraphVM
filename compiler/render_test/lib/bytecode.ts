// @ts-nocheck
import { Op } from '../../src/lib/compiler/opcodes';

export { Op };

export function i32le(v: number): number[] {
	const u = v >>> 0;
	return [u & 0xff, (u >> 8) & 0xff, (u >> 16) & 0xff, (u >> 24) & 0xff];
}

export function f32le(v: number): number[] {
	const buf = new ArrayBuffer(4);
	new Float32Array(buf)[0] = v;
	return [...new Uint8Array(buf)];
}

export function bc(...parts: (number | number[])[]): Uint8Array {
	const flat: number[] = [];
	for (const p of parts) Array.isArray(p) ? flat.push(...p) : flat.push(p);
	return new Uint8Array(flat);
}

export function pushI32(v: number) { return [Op.PUSH_I32, ...i32le(v)]; }
export function pushF32(v: number) { return [Op.PUSH_F32, ...f32le(v)]; }

export function setColor(r: number, g: number, b: number) {
	return [...pushI32(r), ...pushI32(g), ...pushI32(b), Op.SET_COLOR];
}

export function rectFill(x: number, y: number, w: number, h: number) {
	return [...pushI32(x), ...pushI32(y), ...pushI32(w), ...pushI32(h), Op.RECT_FILL];
}

export function callFfi(id: number, argc: number, ...args: number[]) {
	const parts: number[] = [];
	for (const a of args) parts.push(...pushI32(a));
	parts.push(Op.CALL_FFI, id, argc);
	return parts;
}

export function setWindow(x: number, y: number, w: number, h: number, r: number, g: number, b: number) {
	return callFfi(1, 7, x, y, w, h, r, g, b);
}

export function circleFill(cx: number, cy: number, r: number) {
	return [...pushF32(cx), ...pushF32(cy), ...pushF32(r), Op.CIRCLE_FILL];
}

export function bindEvent(eventId: number, pcOffset: number) {
	return callFfi(2, 2, eventId, pcOffset);
}

export function defineFunction(_name: string, numLocals: number): number[] {
	const out: number[] = [];
	for (let i = 0; i < numLocals; i++) {
		out.push(...pushI32(0));
		out.push(Op.STORE_LOCAL, i);
	}
	return out;
}

export function endFunction(): number[] {
	return [];
}
