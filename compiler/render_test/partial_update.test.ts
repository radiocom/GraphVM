// @ts-nocheck
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { loadWasm, reload, run, fireEvent, pixel, destroy } from './lib/wasm-loader';
import { Op, bc, setColor, rectFill, setWindow, circleFill, bindEvent, defineFunction, endFunction } from './lib/bytecode';
import { writePNG } from './lib/ppm';

const W = 400, H = 300, STRIP_H = 4;

function buildMainWithEvent(subOffset: number): number[] {
	const parts: number[] = [];
	parts.push(...setWindow(0, 0, W, H, 255, 255, 255));
	for (let row = 0; row < 5; row++)
		for (let col = 0; col < 8; col++)
			parts.push(...setColor(0, 0, 0), ...rectFill(10 + col * 48, 10 + row * 55, 40, 45));
	parts.push(...bindEvent(0, subOffset), Op.END);
	return parts;
}

function buildEventHandler(): number[] {
	return [
		...defineFunction('bounce', 0),
		...setWindow(50, 50, 150, 200, 0, 0, 0),
		...setColor(255, 0, 0),
		...circleFill(50, 50, 40),
		...endFunction(),
		Op.END
	];
}

function loadWithEvent() {
	const subOff = 4000;
	const main = buildMainWithEvent(subOff);
	while (main.length < subOff) main.push(Op.NOP);
	main.push(...buildEventHandler());
	reload(W, H, STRIP_H, 'rgb', bc(...main));
}

beforeAll(async () => { await loadWasm(); });
afterAll(() => { destroy(); });

describe('partial update preserves outside region', () => {
	test('main renders grid on white bg', () => {
		loadWithEvent();
		const fb = run();

		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
		expect(pixel(fb, 20, 20)).toEqual([0, 0, 0]);
		expect(pixel(fb, 60, 20)).toEqual([0, 0, 0]);
		expect(pixel(fb, 5, 5)).toEqual([255, 255, 255]);
	});

	test('event only changes window region', () => {
		loadWithEvent();
		const fbBefore = run();
		const fbAfter = fireEvent(0)!;
		expect(fbAfter).not.toBeNull();

		for (let y = 0; y < H; y += 3)
			for (let x = 0; x < W; x += 3) {
				const inWindow = x >= 50 && x < 200 && y >= 50 && y < 250;
				if (!inWindow)
					expect(pixel(fbAfter, x, y)).toEqual(pixel(fbBefore, x, y));
			}
	});

	test('red circle inside window after event', () => {
		loadWithEvent();
		run();
		expect(pixel(fireEvent(0)!, 100, 100)).toEqual([255, 0, 0]);
	});

	test('window bg fills window area after event', () => {
		loadWithEvent();
		run();
		const fb = fireEvent(0)!;

		expect(pixel(fb, 51, 51)).toEqual([0, 0, 0]);
		expect(pixel(fb, 199, 249)).toEqual([0, 0, 0]);
	});

	test('rects outside window survive event', () => {
		loadWithEvent();
		run();
		const fb = fireEvent(0)!;

		expect(pixel(fb, 20, 20)).toEqual([0, 0, 0]);
		expect(pixel(fb, 5, 5)).toEqual([255, 255, 255]);
		expect(pixel(fb, 250, 20)).toEqual([0, 0, 0]);
		expect(pixel(fb, 350, 20)).toEqual([0, 0, 0]);
	});

	test('repeated events stay correct', () => {
		loadWithEvent();
		run();
		fireEvent(0);
		const fb = fireEvent(0)!;

		expect(pixel(fb, 100, 100)).toEqual([255, 0, 0]);
		expect(pixel(fb, 51, 51)).toEqual([0, 0, 0]);
		expect(pixel(fb, 20, 20)).toEqual([0, 0, 0]);
		expect(pixel(fb, 5, 5)).toEqual([255, 255, 255]);
	});
});

describe('monolithic equals partial update', () => {
	const SW = 200, SH = 150;
	const SUB_X = 60, SUB_Y = 40, SUB_W = 80, SUB_H = 70;

	function monolithicBytecode(): Uint8Array {
		return bc(
			setWindow(0, 0, SW, SH, 255, 255, 255),
			setColor(0, 0, 0),
			rectFill(10, 10, 30, 20),
			rectFill(50, 10, 30, 20),
			rectFill(90, 10, 30, 20),
			rectFill(130, 10, 30, 20),
			setWindow(SUB_X, SUB_Y, SUB_W, SUB_H, 0, 0, 0),
			setColor(255, 0, 0),
			circleFill(40, 35, 20),
			Op.END
		);
	}

	function partialBytecode(): Uint8Array {
		const subOff = 500;
		const main: number[] = [
			...setWindow(0, 0, SW, SH, 255, 255, 255),
			...setColor(0, 0, 0),
			...rectFill(10, 10, 30, 20),
			...rectFill(50, 10, 30, 20),
			...rectFill(90, 10, 30, 20),
			...rectFill(130, 10, 30, 20),
			...bindEvent(0, subOff),
			Op.END
		];
		while (main.length < subOff) main.push(Op.NOP);
		main.push(
			...defineFunction('update_region', 0),
			...setWindow(SUB_X, SUB_Y, SUB_W, SUB_H, 0, 0, 0),
			...setColor(255, 0, 0),
			...circleFill(40, 35, 20),
			...endFunction(),
			Op.END
		);
		return bc(...main);
	}

	test('monolithic renders rects at original positions', () => {
		reload(SW, SH, STRIP_H, 'rgb', monolithicBytecode());
		const fb = run();

		expect(pixel(fb, 10, 10)).toEqual([0, 0, 0]);
		expect(pixel(fb, 50, 10)).toEqual([0, 0, 0]);
		expect(pixel(fb, 90, 10)).toEqual([0, 0, 0]);
		expect(pixel(fb, 130, 10)).toEqual([0, 0, 0]);
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
		expect(pixel(fb, 100, 75)).toEqual([255, 0, 0]);
	});

	test('partial update matches monolithic pixel-for-pixel', () => {
		reload(SW, SH, STRIP_H, 'rgb', monolithicBytecode());
		const fbMono = run();
		writePNG('./render_test/output/monolithic.png', fbMono, SW, SH);

		reload(SW, SH, STRIP_H, 'rgb', partialBytecode());
		run();
		const fbPartial = fireEvent(0)!;
		writePNG('./render_test/output/partial_update.png', fbPartial, SW, SH);

		let mismatches = 0;
		for (let y = 0; y < SH; y++)
			for (let x = 0; x < SW; x++) {
				const m = pixel(fbMono, x, y);
				const p = pixel(fbPartial, x, y);
				if (m[0] !== p[0] || m[1] !== p[1] || m[2] !== p[2])
					mismatches++;
			}

		expect(mismatches).toBe(0);
	});
});
