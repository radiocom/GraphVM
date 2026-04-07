import type { IR } from './ir';
import { parseColor } from './compiler-wasm';

interface DslLine {
	op: string;
	args: string[];
}

function parseLine(raw: string): DslLine | null {
	let line = raw.replace(/;.*$/, '').trim();
	if (!line) return null;

	const tokens: string[] = [];
	let i = 0;
	while (i < line.length) {
		while (i < line.length && /\s/.test(line[i])) i++;
		if (i >= line.length) break;
		if (line[i] === '"') {
			let j = i + 1;
			while (j < line.length && line[j] !== '"') j++;
			tokens.push(line.slice(i, j + 1));
			i = j + 1;
		} else {
			let j = i;
			while (j < line.length && !/\s/.test(line[j])) j++;
			tokens.push(line.slice(i, j));
			i = j;
		}
	}
	if (tokens.length === 0) return null;
	return { op: tokens[0].toUpperCase(), args: tokens.slice(1) };
}

function isFloat(s: string): boolean {
	return /[.eE]/.test(s);
}

function parseNum(s: string): number {
	return Number(s);
}

function pushArg(ir: IR[], s: string): void {
	if (isFloat(s)) {
		ir.push({ op: 'push_f32', value: parseNum(s) });
	} else {
		ir.push({ op: 'push_i32', value: parseNum(s) | 0 });
	}
}

function pushFloat(ir: IR[], s: string): void {
	ir.push({ op: 'push_f32', value: parseNum(s) });
}

function pushInt(ir: IR[], s: string): void {
	ir.push({ op: 'push_i32', value: parseNum(s) | 0 });
}

export function dslToIR(text: string): IR[] {
	const ir: IR[] = [];
	const lines = text.split('\n');

	for (const raw of lines) {
		const ln = parseLine(raw);
		if (!ln) continue;
		const { op, args } = ln;

		switch (op) {
			case 'SET_COLOR':
				if (args.length >= 3) {
					pushInt(ir, args[0]); pushInt(ir, args[1]); pushInt(ir, args[2]);
					ir.push({ op: 'set_color' });
				}
				break;

			case 'RECT_FILL':
				if (args.length >= 4) {
					pushInt(ir, args[0]); pushInt(ir, args[1]); pushInt(ir, args[2]); pushInt(ir, args[3]);
					ir.push({ op: 'rect_fill' });
				}
				break;

			case 'LINE':
				if (args.length >= 4) {
					pushFloat(ir, args[0]); pushFloat(ir, args[1]);
					pushFloat(ir, args[2]); pushFloat(ir, args[3]);
					ir.push({ op: 'line' });
				}
				break;

			case 'RECT':
				if (args.length >= 4) {
					pushFloat(ir, args[0]); pushFloat(ir, args[1]);
					pushFloat(ir, args[2]); pushFloat(ir, args[3]);
					pushFloat(ir, args.length >= 5 ? args[4] : '0');
					ir.push({ op: 'rect' });
				}
				break;

			case 'PUSH_MATRIX': ir.push({ op: 'push_matrix' }); break;
			case 'POP_MATRIX': ir.push({ op: 'pop_matrix' }); break;

			case 'TRANSLATE':
				if (args.length >= 2) {
					pushFloat(ir, args[0]); pushFloat(ir, args[1]);
					ir.push({ op: 'translate' });
				}
				break;

			case 'ROTATE':
				if (args.length >= 1) {
					pushFloat(ir, args[0]);
					ir.push({ op: 'rotate' });
				}
				break;

			case 'SCALE':
				if (args.length >= 2) {
					pushFloat(ir, args[0]); pushFloat(ir, args[1]);
					ir.push({ op: 'scale' });
				}
				break;

			case 'PATH_BEGIN': ir.push({ op: 'path_begin' }); break;
			case 'PATH_MOVE':
				if (args.length >= 2) { pushFloat(ir, args[0]); pushFloat(ir, args[1]); ir.push({ op: 'path_move' }); }
				break;
			case 'PATH_LINE':
				if (args.length >= 2) { pushFloat(ir, args[0]); pushFloat(ir, args[1]); ir.push({ op: 'path_line' }); }
				break;
			case 'PATH_CUBIC':
				if (args.length >= 6) {
					for (let i = 0; i < 6; i++) pushFloat(ir, args[i]);
					ir.push({ op: 'path_cubic' });
				}
				break;
			case 'PATH_CLOSE': ir.push({ op: 'path_close' }); break;
	
			case 'CIRCLE':
				if (args.length >= 3) {
					pushFloat(ir, args[0]); pushFloat(ir, args[1]); pushFloat(ir, args[2]);
					ir.push({ op: 'circle' });
				}
				break;
	
			case 'CIRCLE_FILL':
				if (args.length >= 3) {
					pushFloat(ir, args[0]); pushFloat(ir, args[1]); pushFloat(ir, args[2]);
					ir.push({ op: 'circle_fill' });
				}
				break;
	
			case 'PATH_END_FILL':
				if (args.length >= 1) {
					ir.push({ op: 'push_i32', value: parseColor(args[0]) });
					ir.push({ op: 'path_fill' });
				}
				break;

			case 'PATH_FILL':
				if (args.length >= 1) {
					ir.push({ op: 'push_i32', value: parseColor(args[0]) });
					ir.push({ op: 'path_fill' });
				}
				break;

			case 'PATH_END_STROKE':
				if (args.length >= 2) {
					ir.push({ op: 'push_i32', value: parseColor(args[0]) });
					pushFloat(ir, args[1]);
					ir.push({ op: 'path_stroke' });
				}
				break;

			case 'PATH_STROKE':
				if (args.length >= 2) {
					ir.push({ op: 'push_i32', value: parseColor(args[0]) });
					pushFloat(ir, args[1]);
					ir.push({ op: 'path_stroke' });
				}
				break;

			case 'TEXT':
				if (args.length >= 3) {
					pushFloat(ir, args[0]); pushFloat(ir, args[1]);
					const content = args.slice(2).join(' ').replace(/^"/, '').replace(/"$/, '');
					ir.push({ op: 'text', content });
				}
				break;

			case 'CALL_FFI':
				if (args.length >= 2) {
					const ffiId = parseNum(args[0]) | 0;
					const ffiArgc = parseNum(args[1]) | 0;
					for (let i = 2; i < args.length; i++) pushArg(ir, args[i]);
					ir.push({ op: 'call_ffi', id: ffiId, argc: ffiArgc });
				}
				break;

			case 'PUSH_IMM':
			case 'PUSH':
				if (args.length >= 1) pushArg(ir, args[0]);
				break;

			case 'PUSH_I32':
				if (args.length >= 1) pushInt(ir, args[0]);
				break;

			case 'PUSH_F32':
				if (args.length >= 1) pushFloat(ir, args[0]);
				break;

			case 'END': ir.push({ op: 'end' }); break;
			case 'NOP': ir.push({ op: 'nop' }); break;
			case 'ADD': ir.push({ op: 'add' }); break;
			case 'SUB': ir.push({ op: 'sub' }); break;
			case 'MUL': ir.push({ op: 'mul' }); break;
			case 'DIV': ir.push({ op: 'div' }); break;
			case 'MOD': ir.push({ op: 'mod' }); break;
			case 'DUP': ir.push({ op: 'dup' }); break;
			case 'DROP': ir.push({ op: 'drop' }); break;
			case 'SWAP': ir.push({ op: 'swap' }); break;
			case 'FADD': ir.push({ op: 'fadd' }); break;
			case 'FSUB': ir.push({ op: 'fsub' }); break;
			case 'FMUL': ir.push({ op: 'fmul' }); break;
			case 'FDIV': ir.push({ op: 'fdiv' }); break;
			case 'I2F': ir.push({ op: 'i2f' }); break;
			case 'F2I': ir.push({ op: 'f2i' }); break;

			default:
				break;
		}
	}

	if (ir.length === 0 || ir[ir.length - 1].op !== 'end') {
		ir.push({ op: 'end' });
	}

	return ir;
}
