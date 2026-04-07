import { parseColor } from './compiler-wasm';

interface SvgTransform {
	type: 'translate' | 'rotate' | 'scale' | 'matrix';
	values: number[];
}

function parseTransform(attr: string): SvgTransform[] {
	const transforms: SvgTransform[] = [];
	const re = /(translate|rotate|scale|matrix)\s*\(([^)]+)\)/gi;
	let match;
	while ((match = re.exec(attr)) !== null) {
		const type = match[1].toLowerCase() as SvgTransform['type'];
		const values = match[2]
			.split(/[\s,]+/)
			.map(Number)
			.filter((n) => !isNaN(n));
		transforms.push({ type, values });
	}
	return transforms;
}

function emitTransforms(lines: string[], transforms: SvgTransform[]) {
	for (const t of transforms) {
		switch (t.type) {
			case 'translate':
				lines.push(`TRANSLATE ${t.values[0] ?? 0} ${t.values[1] ?? 0}`);
				break;
			case 'rotate':
				lines.push(`ROTATE ${t.values[0] ?? 0}`);
				break;
			case 'scale':
				lines.push(`SCALE ${t.values[0] ?? 1} ${t.values[1] ?? t.values[0] ?? 1}`);
				break;
			case 'matrix':
				if (t.values.length >= 6) {
					const [a, b, c, d, e, f] = t.values;
					const angle = Math.atan2(b, a) * (180 / Math.PI);
					const sx = Math.sqrt(a * a + b * b);
					const sy = Math.sqrt(c * c + d * d);
					if (e !== 0 || f !== 0) lines.push(`TRANSLATE ${e} ${f}`);
					if (Math.abs(angle) > 0.01) lines.push(`ROTATE ${angle.toFixed(2)}`);
					if (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01)
						lines.push(`SCALE ${sx.toFixed(4)} ${sy.toFixed(4)}`);
				}
				break;
		}
	}
}

function colorToHex(color: string | null): string {
	if (!color || color === 'none') return 'none';
	if (color.startsWith('#')) return color;
	const val = parseColor(color);
	return '#' + val.toString(16).padStart(6, '0');
}

interface PathCommand {
	cmd: string;
	args: number[];
}

function parseSvgPath(d: string): PathCommand[] {
	const commands: PathCommand[] = [];
	const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
	let match;
	while ((match = re.exec(d)) !== null) {
		const cmd = match[1];
		const args = match[2]
			.trim()
			.split(/[\s,]+/)
			.filter((s) => s.length > 0)
			.map(Number)
			.filter((n) => !isNaN(n));
		commands.push({ cmd, args });
	}
	return commands;
}

function emitPathCommands(lines: string[], d: string) {
	const cmds = parseSvgPath(d);
	let cx = 0,
		cy = 0;
	let startX = 0,
		startY = 0;
	let lastCx2 = 0,
		lastCy2 = 0;
	let lastCmd = '';

	lines.push('PATH_BEGIN');

	for (const { cmd, args } of cmds) {
		switch (cmd) {
			case 'M':
				for (let i = 0; i < args.length; i += 2) {
					cx = args[i];
					cy = args[i + 1];
					if (i === 0) {
						startX = cx;
						startY = cy;
						lines.push(`PATH_MOVE ${cx} ${cy}`);
					} else {
						lines.push(`PATH_LINE ${cx} ${cy}`);
					}
				}
				break;
			case 'm':
				for (let i = 0; i < args.length; i += 2) {
					cx += args[i];
					cy += args[i + 1];
					if (i === 0) {
						startX = cx;
						startY = cy;
						lines.push(`PATH_MOVE ${cx} ${cy}`);
					} else {
						lines.push(`PATH_LINE ${cx} ${cy}`);
					}
				}
				break;
			case 'L':
				for (let i = 0; i < args.length; i += 2) {
					cx = args[i];
					cy = args[i + 1];
					lines.push(`PATH_LINE ${cx} ${cy}`);
				}
				break;
			case 'l':
				for (let i = 0; i < args.length; i += 2) {
					cx += args[i];
					cy += args[i + 1];
					lines.push(`PATH_LINE ${cx} ${cy}`);
				}
				break;
			case 'H':
				for (const x of args) {
					cx = x;
					lines.push(`PATH_LINE ${cx} ${cy}`);
				}
				break;
			case 'h':
				for (const dx of args) {
					cx += dx;
					lines.push(`PATH_LINE ${cx} ${cy}`);
				}
				break;
			case 'V':
				for (const y of args) {
					cy = y;
					lines.push(`PATH_LINE ${cx} ${cy}`);
				}
				break;
			case 'v':
				for (const dy of args) {
					cy += dy;
					lines.push(`PATH_LINE ${cx} ${cy}`);
				}
				break;
			case 'C':
				for (let i = 0; i + 5 < args.length; i += 6) {
					const cx1 = args[i],
						cy1 = args[i + 1];
					const cx2 = args[i + 2],
						cy2 = args[i + 3];
					const x = args[i + 4],
						y = args[i + 5];
					lines.push(`PATH_CUBIC ${cx1} ${cy1} ${cx2} ${cy2} ${x} ${y}`);
					lastCx2 = cx2;
					lastCy2 = cy2;
					cx = x;
					cy = y;
				}
				break;
			case 'c':
				for (let i = 0; i + 5 < args.length; i += 6) {
					const cx1 = cx + args[i],
						cy1 = cy + args[i + 1];
					const cx2 = cx + args[i + 2],
						cy2 = cy + args[i + 3];
					const x = cx + args[i + 4],
						y = cy + args[i + 5];
					lines.push(`PATH_CUBIC ${cx1} ${cy1} ${cx2} ${cy2} ${x} ${y}`);
					lastCx2 = cx2;
					lastCy2 = cy2;
					cx = x;
					cy = y;
				}
				break;
			case 'S':
				for (let i = 0; i + 3 < args.length; i += 4) {
					const cx1 =
						lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's'
							? 2 * cx - lastCx2
							: cx;
					const cy1 =
						lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's'
							? 2 * cy - lastCy2
							: cy;
					const cx2 = args[i],
						cy2 = args[i + 1];
					const x = args[i + 2],
						y = args[i + 3];
					lines.push(`PATH_CUBIC ${cx1} ${cy1} ${cx2} ${cy2} ${x} ${y}`);
					lastCx2 = cx2;
					lastCy2 = cy2;
					cx = x;
					cy = y;
				}
				break;
			case 's':
				for (let i = 0; i + 3 < args.length; i += 4) {
					const cx1 =
						lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's'
							? 2 * cx - lastCx2
							: cx;
					const cy1 =
						lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's'
							? 2 * cy - lastCy2
							: cy;
					const cx2 = cx + args[i],
						cy2 = cy + args[i + 1];
					const x = cx + args[i + 2],
						y = cy + args[i + 3];
					lines.push(`PATH_CUBIC ${cx1} ${cy1} ${cx2} ${cy2} ${x} ${y}`);
					lastCx2 = cx2;
					lastCy2 = cy2;
					cx = x;
					cy = y;
				}
				break;
			case 'Q':
				for (let i = 0; i + 3 < args.length; i += 4) {
					const qx = args[i],
						qy = args[i + 1];
					const x = args[i + 2],
						y = args[i + 3];
					const cx1 = cx + (2 / 3) * (qx - cx);
					const cy1 = cy + (2 / 3) * (qy - cy);
					const cx2 = x + (2 / 3) * (qx - x);
					const cy2 = y + (2 / 3) * (qy - y);
					lines.push(`PATH_CUBIC ${cx1} ${cy1} ${cx2} ${cy2} ${x} ${y}`);
					cx = x;
					cy = y;
				}
				break;
			case 'q':
				for (let i = 0; i + 3 < args.length; i += 4) {
					const qx = cx + args[i],
						qy = cy + args[i + 1];
					const x = cx + args[i + 2],
						y = cy + args[i + 3];
					const cx1 = cx + (2 / 3) * (qx - cx);
					const cy1 = cy + (2 / 3) * (qy - cy);
					const cx2 = x + (2 / 3) * (qx - x);
					const cy2 = y + (2 / 3) * (qy - y);
					lines.push(`PATH_CUBIC ${cx1} ${cy1} ${cx2} ${cy2} ${x} ${y}`);
					cx = x;
					cy = y;
				}
				break;
			case 'A':
			case 'a': {
				const isRel = cmd === 'a';
				for (let i = 0; i + 6 < args.length; i += 7) {
					const ex = isRel ? cx + args[i + 5] : args[i + 5];
					const ey = isRel ? cy + args[i + 6] : args[i + 6];
					lines.push(`PATH_LINE ${ex} ${ey}`);
					cx = ex;
					cy = ey;
				}
				break;
			}
			case 'Z':
			case 'z':
				if (cx !== startX || cy !== startY) {
					lines.push(`PATH_LINE ${startX} ${startY}`);
				}
				cx = startX;
				cy = startY;
				break;
		}
		lastCmd = cmd;
	}
}

function processElement(el: Element, lines: string[]) {
	const tag = el.tagName.toLowerCase();
	const transform = el.getAttribute('transform');
	const hasTransform = transform && transform.trim().length > 0;

	if (hasTransform) {
		lines.push('PUSH_MATRIX');
		emitTransforms(lines, parseTransform(transform!));
	}

	switch (tag) {
		case 'rect': {
			const x = parseFloat(el.getAttribute('x') ?? '0');
			const y = parseFloat(el.getAttribute('y') ?? '0');
			const w = parseFloat(el.getAttribute('width') ?? '0');
			const h = parseFloat(el.getAttribute('height') ?? '0');
			const rx = parseFloat(el.getAttribute('rx') ?? '0');
			const fill = el.getAttribute('fill') ?? el.getAttribute('style')?.match(/fill:\s*([^;]+)/)?.[1];
			const stroke = el.getAttribute('stroke');
			const strokeWidth = parseFloat(el.getAttribute('stroke-width') ?? '1');

			if (fill && fill !== 'none') {
				const c = colorToHex(fill);
				lines.push(`SET_COLOR ${(parseColor(c) >> 16) & 0xff} ${(parseColor(c) >> 8) & 0xff} ${parseColor(c) & 0xff}`);
				lines.push(`RECT ${x} ${y} ${w} ${h} ${rx}`);
			}
			if (stroke && stroke !== 'none') {
				lines.push('PATH_BEGIN');
				lines.push(`PATH_MOVE ${x} ${y}`);
				lines.push(`PATH_LINE ${x + w} ${y}`);
				lines.push(`PATH_LINE ${x + w} ${y + h}`);
				lines.push(`PATH_LINE ${x} ${y + h}`);
				lines.push(`PATH_LINE ${x} ${y}`);
				lines.push(`PATH_STROKE ${colorToHex(stroke)} ${strokeWidth}`);
			}
			break;
		}
		case 'circle': {
			const ccx = parseFloat(el.getAttribute('cx') ?? '0');
			const ccy = parseFloat(el.getAttribute('cy') ?? '0');
			const r = parseFloat(el.getAttribute('r') ?? '0');
			const fill = el.getAttribute('fill');
			const stroke = el.getAttribute('stroke');

			if (fill && fill !== 'none') {
				const c = colorToHex(fill);
				lines.push(`SET_COLOR ${(parseColor(c) >> 16) & 0xff} ${(parseColor(c) >> 8) & 0xff} ${parseColor(c) & 0xff}`);
				lines.push(`CIRCLE_FILL ${ccx} ${ccy} ${r}`);
			}
			if (stroke && stroke !== 'none') {
				const c = colorToHex(stroke);
				lines.push(`SET_COLOR ${(parseColor(c) >> 16) & 0xff} ${(parseColor(c) >> 8) & 0xff} ${parseColor(c) & 0xff}`);
				lines.push(`CIRCLE ${ccx} ${ccy} ${r}`);
			}
			break;
		}
		case 'ellipse': {
			const ecx = parseFloat(el.getAttribute('cx') ?? '0');
			const ecy = parseFloat(el.getAttribute('cy') ?? '0');
			const rx = parseFloat(el.getAttribute('rx') ?? '0');
			const ry = parseFloat(el.getAttribute('ry') ?? '0');
			const fill = el.getAttribute('fill');
			const stroke = el.getAttribute('stroke');
			const strokeWidth = parseFloat(el.getAttribute('stroke-width') ?? '1');
			const k = 0.5522847498;

			lines.push('PATH_BEGIN');
			lines.push(`PATH_MOVE ${ecx + rx} ${ecy}`);
			lines.push(`PATH_CUBIC ${ecx + rx} ${ecy + k * ry} ${ecx + k * rx} ${ecy + ry} ${ecx} ${ecy + ry}`);
			lines.push(`PATH_CUBIC ${ecx - k * rx} ${ecy + ry} ${ecx - rx} ${ecy + k * ry} ${ecx - rx} ${ecy}`);
			lines.push(`PATH_CUBIC ${ecx - rx} ${ecy - k * ry} ${ecx - k * rx} ${ecy - ry} ${ecx} ${ecy - ry}`);
			lines.push(`PATH_CUBIC ${ecx + k * rx} ${ecy - ry} ${ecx + rx} ${ecy - k * ry} ${ecx + rx} ${ecy}`);

			if (fill && fill !== 'none') {
				lines.push(`PATH_FILL ${colorToHex(fill)}`);
			}
			if (stroke && stroke !== 'none') {
				lines.push('PATH_BEGIN');
				lines.push(`PATH_MOVE ${ecx + rx} ${ecy}`);
				lines.push(`PATH_CUBIC ${ecx + rx} ${ecy + k * ry} ${ecx + k * rx} ${ecy + ry} ${ecx} ${ecy + ry}`);
				lines.push(`PATH_CUBIC ${ecx - k * rx} ${ecy + ry} ${ecx - rx} ${ecy + k * ry} ${ecx - rx} ${ecy}`);
				lines.push(`PATH_CUBIC ${ecx - rx} ${ecy - k * ry} ${ecx - k * rx} ${ecy - ry} ${ecx} ${ecy - ry}`);
				lines.push(`PATH_CUBIC ${ecx + k * rx} ${ecy - ry} ${ecx + rx} ${ecy - k * ry} ${ecx + rx} ${ecy}`);
				lines.push(`PATH_STROKE ${colorToHex(stroke)} ${strokeWidth}`);
			}
			break;
		}
		case 'line': {
			const x1 = parseFloat(el.getAttribute('x1') ?? '0');
			const y1 = parseFloat(el.getAttribute('y1') ?? '0');
			const x2 = parseFloat(el.getAttribute('x2') ?? '0');
			const y2 = parseFloat(el.getAttribute('y2') ?? '0');
			const stroke = el.getAttribute('stroke') ?? 'black';
			const strokeWidth = parseFloat(el.getAttribute('stroke-width') ?? '1');

			lines.push('PATH_BEGIN');
			lines.push(`PATH_MOVE ${x1} ${y1}`);
			lines.push(`PATH_LINE ${x2} ${y2}`);
			lines.push(`PATH_STROKE ${colorToHex(stroke)} ${strokeWidth}`);
			break;
		}
		case 'polyline':
		case 'polygon': {
			const points = (el.getAttribute('points') ?? '')
				.trim()
				.split(/[\s,]+/)
				.map(Number);
			const fill = el.getAttribute('fill');
			const stroke = el.getAttribute('stroke');
			const strokeWidth = parseFloat(el.getAttribute('stroke-width') ?? '1');

			if (points.length >= 4) {
				lines.push('PATH_BEGIN');
				lines.push(`PATH_MOVE ${points[0]} ${points[1]}`);
				for (let i = 2; i + 1 < points.length; i += 2) {
					lines.push(`PATH_LINE ${points[i]} ${points[i + 1]}`);
				}
				if (tag === 'polygon') {
					lines.push(`PATH_LINE ${points[0]} ${points[1]}`);
				}
				if (fill && fill !== 'none') {
					lines.push(`PATH_FILL ${colorToHex(fill)}`);
				} else if (stroke && stroke !== 'none') {
					lines.push(`PATH_STROKE ${colorToHex(stroke)} ${strokeWidth}`);
				}
			}
			break;
		}
		case 'path': {
			const d = el.getAttribute('d');
			const fill = el.getAttribute('fill');
			const stroke = el.getAttribute('stroke');
			const strokeWidth = parseFloat(el.getAttribute('stroke-width') ?? '1');

			if (d) {
				if (fill && fill !== 'none') {
					emitPathCommands(lines, d);
					lines.push(`PATH_FILL ${colorToHex(fill)}`);
				}
				if (stroke && stroke !== 'none') {
					emitPathCommands(lines, d);
					lines.push(`PATH_STROKE ${colorToHex(stroke)} ${strokeWidth}`);
				}
				if ((!fill || fill === 'none') && (!stroke || stroke === 'none')) {
					emitPathCommands(lines, d);
					lines.push('PATH_FILL #000000');
				}
			}
			break;
		}
		case 'text': {
			const x = parseFloat(el.getAttribute('x') ?? '0');
			const y = parseFloat(el.getAttribute('y') ?? '0');
			const content = el.textContent ?? '';
			if (content.trim()) {
				lines.push(`; TEXT ${x} ${y} "${content.trim()}" (not rendered)`);
			}
			break;
		}
		case 'g':
		case 'svg':
			for (const child of el.children) {
				processElement(child, lines);
			}
			break;
		default:
			for (const child of el.children) {
				processElement(child, lines);
			}
			break;
	}

	if (hasTransform) {
		lines.push('POP_MATRIX');
	}
}

export function compileSvg(svgText: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgText, 'image/svg+xml');
	const svg = doc.querySelector('svg');
	if (!svg) return '; ERROR: no <svg> element found\nEND';

	const lines: string[] = [];

	for (const child of svg.children) {
		processElement(child, lines);
	}

	lines.push('END');
	return lines.join('\n');
}
