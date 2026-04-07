import { writeFileSync } from "fs";

const MAGIC = 0x47564D42;
const VERSION = 1;
const SECTION_CANVAS = 0x04;
const SECTION_BYTECODE = 0x01;
const SECTION_CONFIG = 0x03;

function writeU32LE(buf: Uint8Array, off: number, val: number) {
	buf[off] = val & 0xff;
	buf[off + 1] = (val >> 8) & 0xff;
	buf[off + 2] = (val >> 16) & 0xff;
	buf[off + 3] = (val >> 24) & 0xff;
}

function writeU16LE(buf: Uint8Array, off: number, val: number) {
	buf[off] = val & 0xff;
	buf[off + 1] = (val >> 8) & 0xff;
}

const OP_PUSH_I32 = 0x01;
const OP_SET_COLOR = 0x40;
const OP_RECT_FILL = 0x41;
const OP_END = 0xFF;

const bytecode = new Uint8Array([
	OP_PUSH_I32, 0xFF, 0x00, 0x00, 0x00,
	OP_PUSH_I32, 0x00, 0x00, 0x00, 0x00,
	OP_PUSH_I32, 0x00, 0x00, 0x00, 0x00,
	OP_SET_COLOR,

	OP_PUSH_I32, 0x0A, 0x00, 0x00, 0x00,
	OP_PUSH_I32, 0x0A, 0x00, 0x00, 0x00,
	OP_PUSH_I32, 0x64, 0x00, 0x00, 0x00,
	OP_PUSH_I32, 0x32, 0x00, 0x00, 0x00,
	OP_RECT_FILL,

	OP_PUSH_I32, 0x00, 0x00, 0x00, 0x00,
	OP_PUSH_I32, 0xFF, 0x00, 0x00, 0x00,
	OP_PUSH_I32, 0x00, 0x00, 0x00, 0x00,
	OP_SET_COLOR,

	OP_PUSH_I32, 0x32, 0x00, 0x00, 0x00,
	OP_PUSH_I32, 0x3C, 0x00, 0x00, 0x00,
	OP_PUSH_I32, 0x50, 0x00, 0x00, 0x00,
	OP_PUSH_I32, 0x28, 0x00, 0x00, 0x00,
	OP_RECT_FILL,

	OP_END,
]);

const canvasData = new Uint8Array(8);
writeU32LE(canvasData, 0, 160);
writeU32LE(canvasData, 4, 120);

const configData = new Uint8Array(4);
writeU16LE(configData, 0, 0);
configData[2] = 0;
configData[3] = 0;

let totalSize = 8;
totalSize += 1 + 4 + canvasData.length;
totalSize += 1 + 4 + bytecode.length;
totalSize += 1 + 4 + configData.length;

const buf = new Uint8Array(totalSize);
writeU32LE(buf, 0, MAGIC);
writeU32LE(buf, 4, VERSION);
let off = 8;

buf[off++] = SECTION_CANVAS;
writeU32LE(buf, off, canvasData.length);
off += 4;
buf.set(canvasData, off);
off += canvasData.length;

buf[off++] = SECTION_BYTECODE;
writeU32LE(buf, off, bytecode.length);
off += 4;
buf.set(bytecode, off);
off += bytecode.length;

buf[off++] = SECTION_CONFIG;
writeU32LE(buf, off, configData.length);
off += 4;
buf.set(configData, off);

writeFileSync("test/test.gvmb", buf);
console.log(`wrote test/test.gvmb (${buf.length} bytes)`);
