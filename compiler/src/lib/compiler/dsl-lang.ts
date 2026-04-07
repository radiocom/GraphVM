import { StreamLanguage } from '@codemirror/language';

interface State {
	inString: boolean;
}

const dslLanguage = StreamLanguage.define<State>({
	startState: () => ({ inString: false }),

	token(stream, state) {
		if (state.inString) {
			if (stream.match(/^[^"\\]+/)) return 'string';
			if (stream.match(/^\\./)) return 'string';
			if (stream.eat('"')) {
				state.inString = false;
				return 'string';
			}
			stream.next();
			return 'string';
		}

		if (stream.eatSpace()) return null;

		if (stream.match(/^;.*/)) return 'comment';

		if (stream.eat('"')) {
			state.inString = true;
			return 'string';
		}

		if (stream.match(/^-?\d+\.\d+/)) return 'number';
		if (stream.match(/^-?\d+/)) return 'number';

		if (
			stream.match(
				/^(SET_COLOR|RECT_FILL|LINE|RECT|TEXT|CIRCLE|CIRCLE_FILL|PUSH_MATRIX|POP_MATRIX|TRANSLATE|ROTATE|SCALE|PATH_BEGIN|PATH_MOVE|PATH_LINE|PATH_CUBIC|PATH_CLOSE|PATH_FILL|PATH_STROKE|PUSH_I32|PUSH_F32|ADD|SUB|MUL|DIV|MOD|NEG|FADD|FSUB|FMUL|FDIV|FNEG|I2F|F2I|DUP|DROP|SWAP|LOAD_LOCAL|STORE_LOCAL|CMP_EQ|CMP_NE|CMP_LT|CMP_GT|CMP_LE|CMP_GE|FCMP_LT|FCMP_GT|FCMP_LE|FCMP_GE|AND|OR|NOT|JMP|JMP_IF|JMP_IF_NOT|CALL|RET|CALL_FFI|NOP|END)\b/
			)
		) {
			return 'keyword';
		}

		stream.next();
		return null;
	}
});

export default dslLanguage;
