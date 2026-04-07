import type { IR } from '../compiler/ir';
import { compileIR } from '../compiler/ir-compiler';

export interface SubFunctionInfo {
	name: string;
	label: string;
	timerId?: number;
}

export class GvmProgram {
	private ir: IR[] = [];
	private labelCounter = 0;
	private localCounter = 0;
	private localMap = new Map<string, number>();
	private subFunctions: SubFunctionInfo[] = [];
	private _currentSubFunction: string | null = null;

	emit(inst: IR): this {
		this.ir.push(inst);
		return this;
	}

	getIR(): IR[] {
		return this.ir;
	}

	getSubFunctions(): SubFunctionInfo[] {
		return [...this.subFunctions];
	}

	compile(): Uint8Array {
		if (this.ir.length === 0 || this.ir[this.ir.length - 1].op !== 'end') {
			this.ir.push({ op: 'end' });
		}
		return compileIR(this.ir);
	}

	newLabel(prefix = 'L'): string {
		return `${prefix}_${this.labelCounter++}`;
	}

	label(name: string): this {
		return this.emit({ op: 'label', name });
	}

	local(name: string): number {
		const existing = this.localMap.get(name);
		if (existing !== undefined) return existing;
		const idx = this.localCounter++;
		this.localMap.set(name, idx);
		return idx;
	}

	pushI32(value: number): this {
		return this.emit({ op: 'push_i32', value: value | 0 });
	}

	pushF32(value: number): this {
		return this.emit({ op: 'push_f32', value });
	}

	loadLocal(nameOrIndex: string | number): this {
		const idx = typeof nameOrIndex === 'string' ? this.local(nameOrIndex) : nameOrIndex;
		return this.emit({ op: 'load_local', index: idx });
	}

	storeLocal(nameOrIndex: string | number): this {
		const idx = typeof nameOrIndex === 'string' ? this.local(nameOrIndex) : nameOrIndex;
		return this.emit({ op: 'store_local', index: idx });
	}

	// ── Local variable convenience methods ──────────────────────────────

	/** Short alias: `$('x')` is equivalent to `loadLocal('x')` */
	$(name: string): this { return this.loadLocal(name); }

	/** Initialize a local: `let('x', 200)` → pushI32(200); storeLocal('x') */
	let(name: string, value: number): this {
		return this.pushI32(value).storeLocal(name);
	}

	/** Set local from current stack top: `set('x')` → storeLocal('x') */
	set(name: string): this { return this.storeLocal(name); }

	/** Copy one local to another: `copy('x', 'ox')` → loadLocal('x'); storeLocal('ox') */
	copy(src: string, dst: string): this {
		return this.loadLocal(src).storeLocal(dst);
	}

	/** Increment: `inc('x', 5)` → x = x + 5 */
	inc(name: string, delta: number = 1): this {
		return this.loadLocal(name).pushI32(delta).add().storeLocal(name);
	}

	/** Decrement: `dec('x', 5)` → x = x - 5 */
	dec(name: string, delta: number = 1): this {
		return this.loadLocal(name).pushI32(delta).sub().storeLocal(name);
	}

	/** Compute: `compute('x', () => { p.$('x').pushI32(STEP).$('dx').mul().add(); })` → x = expr */
	compute(name: string, expr: () => void): this {
		expr();
		return this.storeLocal(name);
	}

	add(): this { return this.emit({ op: 'add' }); }
	sub(): this { return this.emit({ op: 'sub' }); }
	mul(): this { return this.emit({ op: 'mul' }); }
	div(): this { return this.emit({ op: 'div' }); }
	mod(): this { return this.emit({ op: 'mod' }); }
	neg(): this { return this.emit({ op: 'neg' }); }

	fadd(): this { return this.emit({ op: 'fadd' }); }
	fsub(): this { return this.emit({ op: 'fsub' }); }
	fmul(): this { return this.emit({ op: 'fmul' }); }
	fdiv(): this { return this.emit({ op: 'fdiv' }); }
	fneg(): this { return this.emit({ op: 'fneg' }); }

	i2f(): this { return this.emit({ op: 'i2f' }); }
	f2i(): this { return this.emit({ op: 'f2i' }); }

	dup(): this { return this.emit({ op: 'dup' }); }
	drop(): this { return this.emit({ op: 'drop' }); }
	swap(): this { return this.emit({ op: 'swap' }); }

	cmpEq(): this { return this.emit({ op: 'cmp_eq' }); }
	cmpNe(): this { return this.emit({ op: 'cmp_ne' }); }
	cmpLt(): this { return this.emit({ op: 'cmp_lt' }); }
	cmpGt(): this { return this.emit({ op: 'cmp_gt' }); }
	cmpLe(): this { return this.emit({ op: 'cmp_le' }); }
	cmpGe(): this { return this.emit({ op: 'cmp_ge' }); }
	fcmpLt(): this { return this.emit({ op: 'fcmp_lt' }); }
	fcmpGt(): this { return this.emit({ op: 'fcmp_gt' }); }
	fcmpLe(): this { return this.emit({ op: 'fcmp_le' }); }
	fcmpGe(): this { return this.emit({ op: 'fcmp_ge' }); }

	and(): this { return this.emit({ op: 'and' }); }
	or(): this { return this.emit({ op: 'or' }); }
	not(): this { return this.emit({ op: 'not' }); }

	jmp(label: string): this { return this.emit({ op: 'jmp', label }); }
	jmpIf(label: string): this { return this.emit({ op: 'jmp_if', label }); }
	jmpIfNot(label: string): this { return this.emit({ op: 'jmp_if_not', label }); }
	call(label: string): this { return this.emit({ op: 'call', label }); }
	ret(): this { return this.emit({ op: 'ret' }); }

	setColor(r: number, g: number, b: number): this {
		return this.pushI32(r).pushI32(g).pushI32(b).emit({ op: 'set_color' });
	}

	rectFill(x: number, y: number, w: number, h: number): this {
		return this.pushI32(x).pushI32(y).pushI32(w).pushI32(h).emit({ op: 'rect_fill' });
	}

	rect(x: number, y: number, w: number, h: number, radius = 0): this {
		return this.pushF32(x).pushF32(y).pushF32(w).pushF32(h).pushF32(radius).emit({ op: 'rect' });
	}

	line(x0: number, y0: number, x1: number, y1: number): this {
		return this.pushF32(x0).pushF32(y0).pushF32(x1).pushF32(y1).emit({ op: 'line' });
	}

	pushMatrix(): this { return this.emit({ op: 'push_matrix' }); }
	popMatrix(): this { return this.emit({ op: 'pop_matrix' }); }

	translate(x: number, y: number): this {
		return this.pushF32(x).pushF32(y).emit({ op: 'translate' });
	}

	rotate(deg: number): this {
		return this.pushF32(deg).emit({ op: 'rotate' });
	}

	scale(sx: number, sy: number): this {
		return this.pushF32(sx).pushF32(sy).emit({ op: 'scale' });
	}

	withMatrix(fn: () => void): this {
		this.pushMatrix();
		fn();
		this.popMatrix();
		return this;
	}

	pathBegin(): this { return this.emit({ op: 'path_begin' }); }
	pathMove(x: number, y: number): this { return this.pushF32(x).pushF32(y).emit({ op: 'path_move' }); }
	pathLine(x: number, y: number): this { return this.pushF32(x).pushF32(y).emit({ op: 'path_line' }); }
	pathCubic(cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number): this {
		return this.pushF32(cx1).pushF32(cy1).pushF32(cx2).pushF32(cy2).pushF32(x).pushF32(y).emit({ op: 'path_cubic' });
	}
	pathClose(): this { return this.emit({ op: 'path_close' }); }
	pathFill(color: number): this { return this.pushI32(color).emit({ op: 'path_fill' }); }
	pathStroke(color: number, width: number): this {
		return this.pushI32(color).pushF32(width).emit({ op: 'path_stroke' });
	}

	text(x: number, y: number, content: string): this {
		return this.pushF32(x).pushF32(y).emit({ op: 'text', content });
	}

	callFfi(id: number, ...args: number[]): this {
		for (const a of args) this.pushI32(a);
		return this.emit({ op: 'call_ffi', id, argc: args.length });
	}

	setWindow(x: number, y: number, w: number, h: number, bgR: number = 0, bgG: number = 0, bgB: number = 0): this {
		return this.callFfi(1, x, y, w, h, bgR, bgG, bgB);
	}

	end(): this { return this.emit({ op: 'end' }); }

	/**
	 * Define a sub-function that can be invoked by a timer.
	 * Sub-functions are placed after the main program's END instruction.
	 * The sub-function should use setWindow() to specify the dirty region,
	 * then draw within that region. End with endFunction().
	 *
	 * @param name - Unique name for this sub-function
	 * @param timerId - Optional timer ID that triggers this sub-function
	 */
	defineFunction(name: string, eventId?: number): this {
		if (this._currentSubFunction) {
			throw new Error(`Cannot nest sub-functions. Close '${this._currentSubFunction}' first.`);
		}
		const labelName = `__sub_${name}`;
		if (eventId !== undefined) {
			this.emit({ op: 'register_event', event_id: eventId, label: labelName });
		}
		const lastNonLabel = [...this.ir].reverse().find(i => i.op !== 'label');
		if (!lastNonLabel || lastNonLabel.op !== 'end') {
			this.emit({ op: 'end' });
		}
		this._currentSubFunction = name;
		this.subFunctions.push({ name, label: labelName, timerId: eventId });
		this.label(labelName);
		return this;
	}

	/**
	 * End the current sub-function definition.
	 */
	endFunction(): this {
		if (!this._currentSubFunction) {
			throw new Error('No sub-function to end.');
		}
		this.emit({ op: 'end' });
		this._currentSubFunction = null;
		return this;
	}

	circle(cx: number, cy: number, r: number): this {
		return this.pushF32(cx).pushF32(cy).pushF32(r).emit({ op: 'circle' });
	}

	circleFill(cx: number, cy: number, r: number): this {
		return this.pushF32(cx).pushF32(cy).pushF32(r).emit({ op: 'circle_fill' });
	}

	forLoop(varName: string, start: number, end: number, body: (loadVar: () => void) => void): this {
		const idx = this.local(varName);
		const loopLabel = this.newLabel('for');
		const endLabel = this.newLabel('for_end');

		this.pushI32(start).storeLocal(idx);
		this.label(loopLabel);
		this.loadLocal(idx).pushI32(end).cmpLt();
		this.jmpIfNot(endLabel);

		body(() => { this.loadLocal(idx); });

		this.loadLocal(idx).pushI32(1).add().storeLocal(idx);
		this.jmp(loopLabel);
		this.label(endLabel);
		return this;
	}

	ifThen(condition: () => void, thenBlock: () => void, elseBlock?: () => void): this {
		const elseLabel = this.newLabel('else');
		const endLabel = this.newLabel('endif');

		condition();
		if (elseBlock) {
			this.jmpIfNot(elseLabel);
			thenBlock();
			this.jmp(endLabel);
			this.label(elseLabel);
			elseBlock();
			this.label(endLabel);
		} else {
			this.jmpIfNot(endLabel);
			thenBlock();
			this.label(endLabel);
		}
		return this;
	}
}

export function gvm(): GvmProgram {
	return new GvmProgram();
}

export function rgb(r: number, g: number, b: number): number {
	return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

export { compileIR } from '../compiler/ir-compiler';
export type { IR } from '../compiler/ir';
