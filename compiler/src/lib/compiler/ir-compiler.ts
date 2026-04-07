import { Op } from './opcodes';
import type { IR } from './ir';

class ByteBuffer {
	private buf: number[] = [];

	get length() {
		return this.buf.length;
	}

	u8(v: number) {
		this.buf.push(v & 0xff);
	}

	i32le(v: number) {
		const u = v >>> 0;
		this.buf.push(u & 0xff, (u >> 8) & 0xff, (u >> 16) & 0xff, (u >> 24) & 0xff);
	}

	f32le(v: number) {
		const ab = new ArrayBuffer(4);
		new Float32Array(ab)[0] = v;
		const bytes = new Uint8Array(ab);
		this.buf.push(bytes[0], bytes[1], bytes[2], bytes[3]);
	}

	str(s: string) {
		const enc = new TextEncoder();
		const bytes = enc.encode(s);
		for (const b of bytes) this.buf.push(b);
		this.buf.push(0);
	}

	patchI32(offset: number, v: number) {
		const u = v >>> 0;
		this.buf[offset] = u & 0xff;
		this.buf[offset + 1] = (u >> 8) & 0xff;
		this.buf[offset + 2] = (u >> 16) & 0xff;
		this.buf[offset + 3] = (u >> 24) & 0xff;
	}

	toUint8Array(): Uint8Array {
		return new Uint8Array(this.buf);
	}
}

const SIMPLE_OPS: Record<string, number> = {
	nop: Op.NOP,
	add: Op.ADD,
	sub: Op.SUB,
	mul: Op.MUL,
	div: Op.DIV,
	mod: Op.MOD,
	neg: Op.NEG,
	fadd: Op.FADD,
	fsub: Op.FSUB,
	fmul: Op.FMUL,
	fdiv: Op.FDIV,
	fneg: Op.FNEG,
	i2f: Op.I2F,
	f2i: Op.F2I,
	dup: Op.DUP,
	drop: Op.DROP,
	swap: Op.SWAP,
	cmp_eq: Op.CMP_EQ,
	cmp_ne: Op.CMP_NE,
	cmp_lt: Op.CMP_LT,
	cmp_gt: Op.CMP_GT,
	cmp_le: Op.CMP_LE,
	cmp_ge: Op.CMP_GE,
	fcmp_lt: Op.FCMP_LT,
	fcmp_gt: Op.FCMP_GT,
	fcmp_le: Op.FCMP_LE,
	fcmp_ge: Op.FCMP_GE,
	and: Op.AND,
	or: Op.OR,
	not: Op.NOT,
	ret: Op.RET,
	set_color: Op.SET_COLOR,
	rect_fill: Op.RECT_FILL,
	line: Op.LINE,
	rect: Op.RECT,
	push_matrix: Op.PUSH_MATRIX,
	pop_matrix: Op.POP_MATRIX,
	translate: Op.TRANSLATE,
	rotate: Op.ROTATE,
	scale: Op.SCALE,
	circle: Op.CIRCLE,
	circle_fill: Op.CIRCLE_FILL,
	path_begin: Op.PATH_BEGIN,
	path_move: Op.PATH_MOVE,
	path_line: Op.PATH_LINE,
	path_cubic: Op.PATH_CUBIC,
	path_close: Op.PATH_CLOSE,
	path_fill: Op.PATH_FILL,
	path_stroke: Op.PATH_STROKE,
	end: Op.END
};

export interface CompileResult {
	bytecode: Uint8Array;
	labels: Map<string, number>;
}

export function compileIR(instructions: IR[]): Uint8Array {
	return compileIRWithLabels(instructions).bytecode;
}

export function compileIRWithLabels(instructions: IR[]): CompileResult {
	const buf = new ByteBuffer();
	const labels = new Map<string, number>();
	const patches: { offset: number; label: string }[] = [];

	for (const inst of instructions) {
		if (inst.op === 'label') {
			labels.set(inst.name, buf.length);
			continue;
		}

		const simple = SIMPLE_OPS[inst.op];
		if (simple !== undefined) {
			buf.u8(simple);
			continue;
		}

		switch (inst.op) {
			case 'push_i32':
				buf.u8(Op.PUSH_I32);
				buf.i32le(inst.value);
				break;
			case 'push_f32':
				buf.u8(Op.PUSH_F32);
				buf.f32le(inst.value);
				break;
			case 'load_local':
				buf.u8(Op.LOAD_LOCAL);
				buf.u8(inst.index);
				break;
			case 'store_local':
				buf.u8(Op.STORE_LOCAL);
				buf.u8(inst.index);
				break;
			case 'jmp':
				buf.u8(Op.JMP);
				patches.push({ offset: buf.length, label: inst.label });
				buf.i32le(0);
				break;
			case 'jmp_if':
				buf.u8(Op.JMP_IF);
				patches.push({ offset: buf.length, label: inst.label });
				buf.i32le(0);
				break;
			case 'jmp_if_not':
				buf.u8(Op.JMP_IF_NOT);
				patches.push({ offset: buf.length, label: inst.label });
				buf.i32le(0);
				break;
			case 'call':
				buf.u8(Op.CALL);
				patches.push({ offset: buf.length, label: inst.label });
				buf.i32le(0);
				break;
			case 'text':
				buf.u8(Op.TEXT);
				buf.str(inst.content);
				break;
			case 'call_ffi':
				buf.u8(Op.CALL_FFI);
				buf.u8(inst.id);
				buf.u8(inst.argc);
				break;
			case 'register_event':
				buf.u8(Op.PUSH_I32);
				buf.i32le(inst.event_id);
				buf.u8(Op.PUSH_I32);
				patches.push({ offset: buf.length, label: inst.label });
				buf.i32le(0);
				buf.u8(Op.CALL_FFI);
				buf.u8(2);
				buf.u8(2);
				break;
		}
	}

	for (const patch of patches) {
		const target = labels.get(patch.label);
		if (target === undefined) throw new Error(`undefined label: ${patch.label}`);
		buf.patchI32(patch.offset, target);
	}

	return { bytecode: buf.toUint8Array(), labels };
}
