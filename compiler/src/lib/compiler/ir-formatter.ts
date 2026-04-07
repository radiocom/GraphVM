import type { IR } from './ir';

function formatValue(v: number, isFloat: boolean): string {
	if (isFloat) {
		const s = v.toString();
		return s.includes('.') ? s : s + '.0';
	}
	if (v >= 0x100000) return '0x' + v.toString(16);
	return v.toString();
}

function formatInst(inst: IR): string {
	switch (inst.op) {
		case 'label': return `${inst.name}:`;
		case 'push_i32': return `  push_i32 ${formatValue(inst.value, false)}`;
		case 'push_f32': return `  push_f32 ${formatValue(inst.value, true)}`;
		case 'load_local': return `  load_local ${inst.index}`;
		case 'store_local': return `  store_local ${inst.index}`;
		case 'jmp': return `  jmp ${inst.label}`;
		case 'jmp_if': return `  jmp_if ${inst.label}`;
		case 'jmp_if_not': return `  jmp_if_not ${inst.label}`;
		case 'call': return `  call ${inst.label}`;
		case 'text': return `  text "${inst.content}"`;
		case 'call_ffi': return `  call_ffi ${inst.id} ${inst.argc}`;
		case 'register_event': return `  register_event ${inst.event_id} -> ${inst.label}`;
		default: return `  ${inst.op}`;
	}
}

export function formatIR(instructions: IR[]): string {
	return instructions.map(formatInst).join('\n');
}
