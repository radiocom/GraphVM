import { GvmProgram, gvm, rgb } from '$lib/sdk';
import type { SubFunctionInfo } from '$lib/sdk';
import type { IR } from './ir';
import { compileIRWithLabels } from './ir-compiler';

export interface SubFunctionEntry {
	name: string;
	offset: number;
	timerId?: number;
}

export interface SdkResult {
	ir: IR[];
	bytecode: Uint8Array;
	subFunctions: SubFunctionEntry[];
}

export function runSdkCode(code: string): SdkResult {
	const fn = new Function('gvm', 'rgb', 'GvmProgram', code);
	const result = fn(gvm, rgb, GvmProgram);

	let program: GvmProgram;
	if (result instanceof GvmProgram) {
		program = result;
	} else {
		throw new Error('SDK code must return a GvmProgram instance.\nExample: const p = gvm(); p.setColor(255,0,0); return p;');
	}

	const ir = program.getIR();
	if (ir.length === 0 || ir[ir.length - 1].op !== 'end') {
		ir.push({ op: 'end' });
	}

	const { bytecode, labels } = compileIRWithLabels(ir);

	// Resolve sub-function label offsets
	const subFuncInfos: SubFunctionInfo[] = program.getSubFunctions();
	const subFunctions: SubFunctionEntry[] = subFuncInfos.map((sf) => {
		const offset = labels.get(sf.label);
		if (offset === undefined) {
			throw new Error(`Sub-function label '${sf.label}' not found in compiled bytecode`);
		}
		return { name: sf.name, offset, timerId: sf.timerId };
	});

	return { ir, bytecode, subFunctions };
}
