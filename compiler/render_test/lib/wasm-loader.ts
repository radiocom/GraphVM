// @ts-nocheck
import { join } from 'node:path';

export type ColorMode = 'rgb' | 'bw' | 'bwr';

const COLOR_MODE = { rgb: 0, bw: 1, bwr: 2 } as const;

let mod: any = null;
let _reload: any, _run: any, _getFb: any, _destroy: any, _fireEvent: any;
let flashPtr = 0;
let W = 0, H = 0;

export async function loadWasm() {
	if (mod) return;
	const vmJsPath = join(__dirname, '..', '..', 'static', 'vm.js');
	const { default: createVmModule } = await import(vmJsPath);
	mod = await createVmModule({
		locateFile: (p: string) =>
			p.endsWith('.wasm') ? join(__dirname, '..', '..', 'static', 'vm.wasm') : p
	});
	_reload = mod.cwrap('vm_wasm_reload', null, ['number','number','number','number','number','number','number','number','number']);
	_run = mod.cwrap('vm_wasm_run', null, []);
	_getFb = mod.cwrap('vm_wasm_get_framebuf', 'number', []);
	_destroy = mod.cwrap('vm_wasm_destroy', null, []);
	_fireEvent = mod.cwrap('vm_wasm_fire_event', 'number', ['number']);
}

export function reload(w: number, h: number, stripH: number, colorMode: ColorMode,
	flash?: Uint8Array, codeOff = 0, codeLen = 0, resOff = 0, resLen = 0) {
	if (flashPtr) { mod._free(flashPtr); flashPtr = 0; }
	let dataPtr = 0;
	if (flash?.length) {
		flashPtr = mod._malloc(flash.length);
		mod.HEAPU8.set(flash, flashPtr);
		dataPtr = flashPtr;
		if (!codeLen) codeLen = flash.length;
	}
	W = w; H = h;
	_reload(w, h, stripH, COLOR_MODE[colorMode], dataPtr, codeOff, codeLen, resOff, resLen);
}

export function run(): Uint8Array {
	_run();
	const ptr = _getFb();
	return new Uint8Array(mod.HEAPU8.buffer.slice(ptr, ptr + W * H * 3));
}

export function fireEvent(id: number): Uint8Array | null {
	if (!_fireEvent(id)) return null;
	const ptr = _getFb();
	return new Uint8Array(mod.HEAPU8.buffer.slice(ptr, ptr + W * H * 3));
}

export function pixel(fb: Uint8Array, x: number, y: number): [number, number, number] {
	const i = (y * W + x) * 3;
	return [fb[i], fb[i + 1], fb[i + 2]];
}

export function destroy() {
	_destroy?.();
	if (mod && flashPtr) { mod._free(flashPtr); flashPtr = 0; }
}
