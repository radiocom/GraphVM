interface EmscriptenModule {
	ccall: (name: string, returnType: string | null, argTypes: string[], args: unknown[]) => unknown;
	cwrap: (
		name: string,
		returnType: string | null,
		argTypes: string[]
	) => (...args: unknown[]) => unknown;
	HEAPU8: Uint8Array;
	_malloc: (size: number) => number;
	_free: (ptr: number) => void;
}

declare global {
	function createVmModule(opts?: object): Promise<EmscriptenModule>;
}

export type ColorMode = 'rgb' | 'bw' | 'bwr';

const COLOR_MODE_RGB = 0;
const COLOR_MODE_BW = 1;
const COLOR_MODE_BWR = 2;

function colorModeToInt(mode: ColorMode): number {
	switch (mode) {
		case 'bw':
			return COLOR_MODE_BW;
		case 'bwr':
			return COLOR_MODE_BWR;
		default:
			return COLOR_MODE_RGB;
	}
}

let mod: EmscriptenModule | null = null;
let _reload: (
	w: number, h: number, s: number, colorMode: number,
	data: number, codeOff: number, codeLen: number,
	resOff: number, resLen: number
) => void;
let _run: () => void;
let _getFb: () => number;
let _destroy: () => void;
let _fireEvent: (eventId: number) => number;

export async function loadWasm(): Promise<void> {
	if (mod) return;

	await new Promise<void>((resolve, reject) => {
		const s = document.createElement('script');
		s.src = '/vm.js';
		s.onload = () => resolve();
		s.onerror = () => reject(new Error('Failed to load vm.js'));
		document.head.appendChild(s);
	});

	mod = await createVmModule();

	_reload = mod.cwrap('vm_wasm_reload', null, [
		'number', 'number', 'number', 'number',
		'number', 'number', 'number', 'number', 'number'
	]) as typeof _reload;
	_run = mod.cwrap('vm_wasm_run', null, []) as typeof _run;
	_getFb = mod.cwrap('vm_wasm_get_framebuf', 'number', []) as typeof _getFb;
	_destroy = mod.cwrap('vm_wasm_destroy', null, []) as typeof _destroy;
	_fireEvent = mod.cwrap('vm_wasm_fire_event', 'number', ['number']) as typeof _fireEvent;
}

let flashPtr = 0;
let lastW = 0;
let lastH = 0;

export function reload(
	w: number, h: number, stripH: number, colorMode: ColorMode,
	flash?: Uint8Array, codeOff = 0, codeLen = 0, resOff = 0, resLen = 0
): void {
	if (!mod) throw new Error('WASM not loaded');

	if (flashPtr) { mod._free(flashPtr); flashPtr = 0; }

	let dataPtr = 0;
	if (flash && flash.length) {
		flashPtr = mod._malloc(flash.length);
		mod.HEAPU8.set(flash, flashPtr);
		dataPtr = flashPtr;
		if (!codeLen) codeLen = flash.length;
	}

	lastW = w;
	lastH = h;
	_reload(w, h, stripH, colorModeToInt(colorMode),
		dataPtr, codeOff, codeLen, resOff, resLen);
}

export function run(): ImageData {
	if (!mod) throw new Error('WASM not loaded');
	_run();
	return readFramebuffer();
}

export function fireEvent(eventId: number): ImageData | null {
	if (!mod) throw new Error('WASM not loaded');
	const fired = _fireEvent(eventId);
	if (!fired) return null;
	return readFramebuffer();
}

function readFramebuffer(): ImageData {
	if (!mod) throw new Error('WASM not loaded');
	const fbPtr = _getFb();
	const rgb = mod.HEAPU8.subarray(fbPtr, fbPtr + lastW * lastH * 3);

	const pixels = new ImageData(lastW, lastH);
	for (let i = 0; i < lastW * lastH; i++) {
		pixels.data[i * 4 + 0] = rgb[i * 3 + 0];
		pixels.data[i * 4 + 1] = rgb[i * 3 + 1];
		pixels.data[i * 4 + 2] = rgb[i * 3 + 2];
		pixels.data[i * 4 + 3] = 255;
	}

	return pixels;
}

export function destroyVm(): void {
	if (_destroy) _destroy();
	if (mod && flashPtr) {
		mod._free(flashPtr);
		flashPtr = 0;
	}
}
