// @ts-nocheck
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { loadWasm, reload, run, fireEvent, pixel, destroy } from './lib/wasm-loader';
import { Op, bc, setColor, rectFill, setWindow, circleFill, pushI32, bindEvent } from './lib/bytecode';

const STRIP_H = 4;

beforeAll(async () => { await loadWasm(); });
afterAll(() => { destroy(); });

describe('basic drawing without setWindow', () => {
	test('white screen by default', () => {
		reload(40, 30, STRIP_H, 'rgb', bc(Op.END));
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
		expect(pixel(fb, 20, 15)).toEqual([255, 255, 255]);
		expect(pixel(fb, 39, 29)).toEqual([255, 255, 255]);
	});

	test('red rect at (5,5,10,10) on white bg', () => {
		reload(40, 30, STRIP_H, 'rgb', bc(setColor(255, 0, 0), rectFill(5, 5, 10, 10), Op.END));
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
		expect(pixel(fb, 10, 10)).toEqual([255, 0, 0]);
		expect(pixel(fb, 5, 5)).toEqual([255, 0, 0]);
		expect(pixel(fb, 14, 14)).toEqual([255, 0, 0]);
		expect(pixel(fb, 15, 15)).toEqual([255, 255, 255]);
	});

	test('rect spans multiple strips', () => {
		reload(40, 30, STRIP_H, 'rgb', bc(setColor(0, 255, 0), rectFill(0, 0, 10, 20), Op.END));
		const fb = run();
		for (const y of [0, 3, 4, 7, 15, 19])
			expect(pixel(fb, 5, y)).toEqual([0, 255, 0]);
		expect(pixel(fb, 5, 20)).toEqual([255, 255, 255]);
	});
});

describe('setWindow background fill', () => {
	test('fills window region with bg color', () => {
		reload(40, 30, STRIP_H, 'rgb', bc(setWindow(0, 0, 40, 30, 40, 40, 40), Op.END));
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([40, 40, 40]);
		expect(pixel(fb, 20, 15)).toEqual([40, 40, 40]);
		expect(pixel(fb, 39, 29)).toEqual([40, 40, 40]);
	});

	test('partial region only fills that region', () => {
		reload(40, 30, STRIP_H, 'rgb', bc(setWindow(10, 10, 20, 10, 100, 0, 0), Op.END));
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
		expect(pixel(fb, 15, 15)).toEqual([100, 0, 0]);
		expect(pixel(fb, 10, 10)).toEqual([100, 0, 0]);
		expect(pixel(fb, 29, 19)).toEqual([100, 0, 0]);
		expect(pixel(fb, 30, 15)).toEqual([255, 255, 255]);
		expect(pixel(fb, 15, 20)).toEqual([255, 255, 255]);
	});
});

describe('setWindow + drawing', () => {
	test('dark bg window with colored rect', () => {
		const code = bc(setWindow(0, 0, 40, 30, 40, 40, 40), setColor(255, 0, 0), rectFill(5, 5, 10, 10), Op.END);
		reload(40, 30, STRIP_H, 'rgb', code);
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([40, 40, 40]);
		expect(pixel(fb, 10, 10)).toEqual([255, 0, 0]);
		expect(pixel(fb, 39, 29)).toEqual([40, 40, 40]);
	});

	test('bg preserved across all strip boundaries', () => {
		reload(40, 30, STRIP_H, 'rgb', bc(setWindow(0, 0, 40, 30, 50, 60, 70), Op.END));
		const fb = run();
		for (let y = 0; y < 30; y++)
			expect(pixel(fb, 20, y)).toEqual([50, 60, 70]);
	});

	test('drawing visible on every strip', () => {
		const code = bc(setWindow(0, 0, 40, 30, 40, 40, 40), setColor(255, 0, 0), rectFill(15, 0, 10, 30), Op.END);
		reload(40, 30, STRIP_H, 'rgb', code);
		const fb = run();
		for (let y = 0; y < 30; y++) {
			expect(pixel(fb, 20, y)).toEqual([255, 0, 0]);
			expect(pixel(fb, 5, y)).toEqual([40, 40, 40]);
		}
	});

	test('circleFill visible', () => {
		const code = bc(setWindow(0, 0, 100, 100, 40, 40, 40), setColor(255, 100, 50), circleFill(50, 50, 20), Op.END);
		reload(100, 100, STRIP_H, 'rgb', code);
		const fb = run();
		expect(pixel(fb, 50, 50)).toEqual([255, 100, 50]);
		expect(pixel(fb, 0, 0)).toEqual([40, 40, 40]);
	});
});

describe('grid of colored rects (sdk_demo pattern)', () => {
	test('multiple rects on dark bg', () => {
		const parts: number[] = [...setWindow(0, 0, 100, 80, 40, 40, 40)];
		for (let row = 0; row < 2; row++)
			for (let col = 0; col < 3; col++) {
				parts.push(...setColor((col * 80) & 0xff, (row * 120) & 0xff, 128));
				parts.push(...rectFill(5 + col * 30, 5 + row * 35, 25, 30));
			}
		parts.push(Op.END);
		reload(100, 80, STRIP_H, 'rgb', bc(...parts));
		const fb = run();

		expect(pixel(fb, 0, 0)).toEqual([40, 40, 40]);
		expect(pixel(fb, 10, 10)).toEqual([0, 0, 128]);
		expect(pixel(fb, 40, 10)).toEqual([80, 0, 128]);
		expect(pixel(fb, 70, 10)).toEqual([160, 0, 128]);
		expect(pixel(fb, 10, 45)).toEqual([0, 120, 128]);
		expect(pixel(fb, 40, 45)).toEqual([80, 120, 128]);
		expect(pixel(fb, 70, 45)).toEqual([160, 120, 128]);
		expect(pixel(fb, 99, 79)).toEqual([40, 40, 40]);
	});
});

describe('BW mode', () => {
	test('black rect on white bg', () => {
		const code = bc(setWindow(0, 0, 40, 30, 255, 255, 255), setColor(0, 0, 0), rectFill(5, 5, 10, 10), Op.END);
		reload(40, 30, STRIP_H, 'bw', code);
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
		expect(pixel(fb, 10, 10)).toEqual([0, 0, 0]);
	});
});

describe('BWR mode', () => {
	test('black and red rects on white bg', () => {
		const code = bc(
			setWindow(0, 0, 60, 30, 255, 255, 255),
			setColor(0, 0, 0), rectFill(5, 5, 10, 10),
			setColor(255, 0, 0), rectFill(25, 5, 10, 10),
			Op.END
		);
		reload(60, 30, STRIP_H, 'bwr', code);
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
		expect(pixel(fb, 10, 10)).toEqual([0, 0, 0]);
		expect(pixel(fb, 30, 10)).toEqual([255, 0, 0]);
	});
});

describe('event firing', () => {
	test('fire_event updates dirty region', () => {
		const subOffset = 200;
		const mainCode: number[] = [
			...setWindow(0, 0, 40, 30, 255, 255, 255),
			...setColor(0, 0, 255), ...rectFill(0, 0, 40, 30),
			...bindEvent(0, subOffset),
			Op.END
		];
		while (mainCode.length < subOffset) mainCode.push(Op.NOP);
		const subCode: number[] = [
			...setWindow(10, 10, 20, 10, 0, 255, 0),
			...setColor(255, 0, 0), ...rectFill(5, 2, 10, 6),
			Op.END
		];
		reload(40, 30, STRIP_H, 'rgb', bc(...mainCode, ...subCode));

		const fb1 = run();
		expect(pixel(fb1, 20, 15)).toEqual([0, 0, 255]);

		const fb2 = fireEvent(0)!;
		expect(fb2).not.toBeNull();
		expect(pixel(fb2, 15, 12)).toEqual([255, 0, 0]);
		expect(pixel(fb2, 12, 11)).toEqual([0, 255, 0]);
		expect(pixel(fb2, 0, 0)).toEqual([0, 0, 255]);
	});
});
