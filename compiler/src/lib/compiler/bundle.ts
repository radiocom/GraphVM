import type { ResourceEntry, RuntimeConfig } from '$lib/types';
import type { SubFunctionEntry } from './sdk-runner';

const BUNDLE_MAGIC = 0x47564d42;
const BUNDLE_VERSION = 1;

const SECTION_BYTECODE = 0x01;
const SECTION_RESOURCE = 0x02;
const SECTION_CONFIG = 0x03;
const SECTION_CANVAS = 0x04;
const SECTION_SUBFUNC = 0x05;

function writeU32LE(buf: Uint8Array, offset: number, val: number) {
	buf[offset] = val & 0xff;
	buf[offset + 1] = (val >> 8) & 0xff;
	buf[offset + 2] = (val >> 16) & 0xff;
	buf[offset + 3] = (val >> 24) & 0xff;
}

function writeU16LE(buf: Uint8Array, offset: number, val: number) {
	buf[offset] = val & 0xff;
	buf[offset + 1] = (val >> 8) & 0xff;
}

function encodeConfig(config: RuntimeConfig): Uint8Array {
	const enabledTimers = config.timers.filter((t) => t.enabled);
	const size = 4 + enabledTimers.length * 4;
	const buf = new Uint8Array(size);
	writeU16LE(buf, 0, 0);
	buf[2] = enabledTimers.length;
	buf[3] = 0;
	let off = 4;
	for (const t of enabledTimers) {
		buf[off] = t.id;
		buf[off + 1] = 0;
		writeU16LE(buf, off + 2, t.intervalMs);
		off += 4;
	}
	return buf;
}

function colorModeToU8(mode: string): number {
	switch (mode) {
		case 'bw': return 1;
		case 'bwr': return 2;
		default: return 0; // rgb
	}
}

function encodeCanvas(deviceW: number, deviceH: number, colorMode: string): Uint8Array {
	const buf = new Uint8Array(12);
	writeU32LE(buf, 0, deviceW);
	writeU32LE(buf, 4, deviceH);
	buf[8] = colorModeToU8(colorMode);
	buf[9] = 0; buf[10] = 0; buf[11] = 0; // padding
	return buf;
}

export function buildBundle(
	bytecodeData: Uint8Array,
	resourceEntries: ResourceEntry[],
	config: RuntimeConfig,
	deviceW: number = 160,
	deviceH: number = 120,
	subFunctions: SubFunctionEntry[] = [],
	colorMode: string = 'rgb'
): Uint8Array {
	const configData = encodeConfig(config);
	const canvasData = encodeCanvas(deviceW, deviceH, colorMode);

	let totalSize = 8;

	// Canvas section
	totalSize += 1 + 4 + canvasData.length;

	// Bytecode section
	totalSize += 1 + 4 + bytecodeData.length;

	// Resource sections
	for (const res of resourceEntries) {
		const nameBytes = new TextEncoder().encode(res.group + ':' + res.name);
		totalSize += 1 + 4 + 1 + nameBytes.length + res.data.length;
	}

	// Config section
	totalSize += 1 + 4 + configData.length;

	// SubFunction section (if any)
	let subFuncData: Uint8Array | null = null;
	if (subFunctions.length > 0) {
		const subFuncSize = 1 + subFunctions.length * 8; // count + (timerId + pad + pad + pad + offset_u32) * count
		subFuncData = new Uint8Array(subFuncSize);
		subFuncData[0] = subFunctions.length;
		let sfOff = 1;
		for (const sf of subFunctions) {
			subFuncData[sfOff] = sf.timerId ?? 0xFF; // 0xFF = no timer
			subFuncData[sfOff + 1] = 0;
			subFuncData[sfOff + 2] = 0;
			subFuncData[sfOff + 3] = 0;
			writeU32LE(subFuncData, sfOff + 4, sf.offset);
			sfOff += 8;
		}
		totalSize += 1 + 4 + subFuncData.length;
	}

	const buf = new Uint8Array(totalSize);
	writeU32LE(buf, 0, BUNDLE_MAGIC);
	writeU32LE(buf, 4, BUNDLE_VERSION);
	let off = 8;

	// Canvas section first (so loader knows dimensions before bytecode)
	buf[off++] = SECTION_CANVAS;
	writeU32LE(buf, off, canvasData.length);
	off += 4;
	buf.set(canvasData, off);
	off += canvasData.length;

	// Bytecode section
	buf[off++] = SECTION_BYTECODE;
	writeU32LE(buf, off, bytecodeData.length);
	off += 4;
	buf.set(bytecodeData, off);
	off += bytecodeData.length;

	// Resource sections
	for (const res of resourceEntries) {
		const nameBytes = new TextEncoder().encode(res.group + ':' + res.name);
		buf[off++] = SECTION_RESOURCE;
		writeU32LE(buf, off, nameBytes.length + 1 + res.data.length);
		off += 4;
		buf[off++] = nameBytes.length;
		buf.set(nameBytes, off);
		off += nameBytes.length;
		buf.set(res.data, off);
		off += res.data.length;
	}

	// Config section
	buf[off++] = SECTION_CONFIG;
	writeU32LE(buf, off, configData.length);
	off += 4;
	buf.set(configData, off);
	off += configData.length;

	// SubFunction section
	if (subFuncData) {
		buf[off++] = SECTION_SUBFUNC;
		writeU32LE(buf, off, subFuncData.length);
		off += 4;
		buf.set(subFuncData, off);
	}

	return buf;
}

export async function writeToDirectory(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	dirHandle: any,
	filename: string,
	data: Uint8Array
): Promise<void> {
	const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
	const writable = await fileHandle.createWritable();
	await writable.write(new Uint8Array(data.buffer, data.byteOffset, data.byteLength) as any);
	await writable.close();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pickDirectory(): Promise<any> {
	return await (window as any).showDirectoryPicker({ mode: 'readwrite' });
}
