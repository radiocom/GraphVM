export type IR =
	| { op: 'nop' }
	| { op: 'push_i32'; value: number }
	| { op: 'push_f32'; value: number }
	| { op: 'add' }
	| { op: 'sub' }
	| { op: 'mul' }
	| { op: 'div' }
	| { op: 'mod' }
	| { op: 'neg' }
	| { op: 'fadd' }
	| { op: 'fsub' }
	| { op: 'fmul' }
	| { op: 'fdiv' }
	| { op: 'fneg' }
	| { op: 'i2f' }
	| { op: 'f2i' }
	| { op: 'dup' }
	| { op: 'drop' }
	| { op: 'swap' }
	| { op: 'load_local'; index: number }
	| { op: 'store_local'; index: number }
	| { op: 'cmp_eq' }
	| { op: 'cmp_ne' }
	| { op: 'cmp_lt' }
	| { op: 'cmp_gt' }
	| { op: 'cmp_le' }
	| { op: 'cmp_ge' }
	| { op: 'fcmp_lt' }
	| { op: 'fcmp_gt' }
	| { op: 'fcmp_le' }
	| { op: 'fcmp_ge' }
	| { op: 'and' }
	| { op: 'or' }
	| { op: 'not' }
	| { op: 'jmp'; label: string }
	| { op: 'jmp_if'; label: string }
	| { op: 'jmp_if_not'; label: string }
	| { op: 'call'; label: string }
	| { op: 'ret' }
	| { op: 'label'; name: string }
	| { op: 'set_color' }
	| { op: 'rect_fill' }
	| { op: 'line' }
	| { op: 'rect' }
	| { op: 'push_matrix' }
	| { op: 'pop_matrix' }
	| { op: 'translate' }
	| { op: 'rotate' }
	| { op: 'scale' }
	| { op: 'path_begin' }
	| { op: 'path_move' }
	| { op: 'path_line' }
	| { op: 'path_cubic' }
	| { op: 'path_close' }
	| { op: 'path_fill' }
	| { op: 'path_stroke' }
	| { op: 'circle' }
	| { op: 'circle_fill' }
	| { op: 'text'; content: string }
	| { op: 'call_ffi'; id: number; argc: number }
	| { op: 'register_event'; event_id: number; label: string }
	| { op: 'end' };
