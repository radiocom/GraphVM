// @ts-nocheck
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { loadWasm, reload, run, fireEvent, pixel, destroy } from './lib/wasm-loader';
import { Op, bc, setColor, rectFill, setWindow, circleFill, pushI32, pushF32, bindEvent } from './lib/bytecode';

const STRIP_H = 4;

beforeAll(async () => { await loadWasm(); });
afterAll(() => { destroy(); });

describe('setWindow: single call RGB', () => {
	test('full screen dark bg', () => {
		reload(60, 40, STRIP_H, 'rgb', bc(setWindow(0, 0, 60, 40, 30, 30, 50), Op.END));
		const fb = run();
		for (let y = 0; y < 40; y += 7)
			for (let x = 0; x < 60; x += 11)
				expect(pixel(fb, x, y)).toEqual([30, 30, 50]);
	});

	test('small window centered', () => {
		reload(60, 40, STRIP_H, 'rgb', bc(setWindow(20, 10, 20, 20, 100, 0, 0), Op.END));
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
		expect(pixel(fb, 30, 20)).toEqual([100, 0, 0]);
		expect(pixel(fb, 19, 15)).toEqual([255, 255, 255]);
		expect(pixel(fb, 40, 15)).toEqual([255, 255, 255]);
	});

	test('window at bottom-right corner', () => {
		reload(60, 40, STRIP_H, 'rgb', bc(setWindow(40, 20, 20, 20, 0, 200, 0), Op.END));
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
		expect(pixel(fb, 50, 30)).toEqual([0, 200, 0]);
		expect(pixel(fb, 59, 39)).toEqual([0, 200, 0]);
		expect(pixel(fb, 39, 30)).toEqual([255, 255, 255]);
	});

	test('window with drawing inside', () => {
		const code = bc(
			setWindow(10, 5, 30, 20, 50, 50, 50),
			setColor(255, 0, 0), rectFill(5, 3, 10, 8),
			Op.END
		);
		reload(60, 40, STRIP_H, 'rgb', code);
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
		expect(pixel(fb, 12, 7)).toEqual([50, 50, 50]);
		expect(pixel(fb, 10 + 5, 5 + 3)).toEqual([255, 0, 0]);
		expect(pixel(fb, 10 + 14, 5 + 10)).toEqual([255, 0, 0]);
		expect(pixel(fb, 10 + 15, 5 + 5)).toEqual([50, 50, 50]);
	});
});

describe('setWindow: single call BW', () => {
	test('black rect on white window', () => {
		const code = bc(
			setWindow(5, 5, 50, 30, 255, 255, 255),
			setColor(0, 0, 0), rectFill(10, 10, 20, 10),
			Op.END
		);
		reload(60, 40, STRIP_H, 'bw', code);
		const fb = run();
		expect(pixel(fb, 20, 20)).toEqual([0, 0, 0]);
		expect(pixel(fb, 8, 8)).toEqual([255, 255, 255]);
	});
});

describe('setWindow: single call BWR', () => {
	test('black and red rects coexist', () => {
		const code = bc(
			setWindow(0, 0, 60, 40, 255, 255, 255),
			setColor(0, 0, 0), rectFill(5, 5, 15, 15),
			setColor(255, 0, 0), rectFill(30, 5, 15, 15),
			Op.END
		);
		reload(60, 40, STRIP_H, 'bwr', code);
		const fb = run();
		expect(pixel(fb, 10, 10)).toEqual([0, 0, 0]);
		expect(pixel(fb, 37, 10)).toEqual([255, 0, 0]);
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
	});

	test('black and red across strip boundaries', () => {
		const code = bc(
			setWindow(0, 0, 40, 30, 255, 255, 255),
			setColor(0, 0, 0), rectFill(5, 0, 10, 30),
			setColor(255, 0, 0), rectFill(25, 0, 10, 30),
			Op.END
		);
		reload(40, 30, STRIP_H, 'bwr', code);
		const fb = run();
		for (let y = 0; y < 30; y++) {
			expect(pixel(fb, 10, y)).toEqual([0, 0, 0]);
			expect(pixel(fb, 30, y)).toEqual([255, 0, 0]);
			expect(pixel(fb, 20, y)).toEqual([255, 255, 255]);
		}
	});
});

describe('setWindow: main + event sub-function', () => {
	test('main full screen, event updates small region', () => {
		const subOff = 100;
		const main: number[] = [
			...setWindow(0, 0, 40, 30, 200, 200, 200),
			...setColor(0, 0, 255), ...rectFill(0, 0, 40, 30),
			...bindEvent(0, subOff),
			Op.END
		];
		while (main.length < subOff) main.push(Op.NOP);
		const sub: number[] = [
			...setWindow(10, 10, 20, 10, 0, 255, 0),
			...setColor(255, 0, 0), ...rectFill(5, 2, 10, 6),
			Op.END
		];
		reload(40, 30, STRIP_H, 'rgb', bc(...main, ...sub));

		const fb1 = run();
		expect(pixel(fb1, 5, 5)).toEqual([0, 0, 255]);
		expect(pixel(fb1, 20, 15)).toEqual([0, 0, 255]);

		const fb2 = fireEvent(0)!;
		expect(fb2).not.toBeNull();
		expect(pixel(fb2, 15, 12)).toEqual([255, 0, 0]);
		expect(pixel(fb2, 11, 11)).toEqual([0, 255, 0]);
		expect(pixel(fb2, 5, 5)).toEqual([0, 0, 255]);
		expect(pixel(fb2, 35, 25)).toEqual([0, 0, 255]);
	});

	test('event fired twice updates correctly', () => {
		const subOff = 200;
		const main: number[] = [
			...setWindow(0, 0, 40, 20, 255, 255, 255),
			...setColor(0, 0, 0), ...rectFill(0, 0, 40, 20),
			...bindEvent(0, subOff),
			Op.END
		];
		while (main.length < subOff) main.push(Op.NOP);
		const sub: number[] = [
			...setWindow(5, 5, 10, 10, 128, 128, 128),
			...setColor(255, 0, 0), ...rectFill(2, 2, 6, 6),
			Op.END
		];
		reload(40, 20, STRIP_H, 'rgb', bc(...main, ...sub));

		run();
		const fb1 = fireEvent(0)!;
		expect(pixel(fb1, 5 + 2, 5 + 2)).toEqual([255, 0, 0]);
		expect(pixel(fb1, 5 + 5, 5 + 5)).toEqual([255, 0, 0]);
		expect(pixel(fb1, 5 + 0, 5 + 0)).toEqual([128, 128, 128]);
		expect(pixel(fb1, 5 + 8, 5 + 1)).toEqual([128, 128, 128]);
		expect(pixel(fb1, 0, 0)).toEqual([0, 0, 0]);

		const fb2 = fireEvent(0)!;
		expect(pixel(fb2, 5 + 3, 5 + 3)).toEqual([255, 0, 0]);
		expect(pixel(fb2, 5 + 0, 5 + 0)).toEqual([128, 128, 128]);
		expect(pixel(fb2, 0, 0)).toEqual([0, 0, 0]);
	});
});

describe('setWindow: event in BWR mode', () => {
	test('main bwr, event updates region', () => {
		const subOff = 100;
		const main: number[] = [
			...setWindow(0, 0, 60, 30, 255, 255, 255),
			...setColor(0, 0, 0), ...rectFill(0, 0, 60, 30),
			...bindEvent(0, subOff),
			Op.END
		];
		while (main.length < subOff) main.push(Op.NOP);
		const sub: number[] = [
			...setWindow(10, 5, 20, 10, 255, 255, 255),
			...setColor(255, 0, 0), ...rectFill(5, 2, 10, 6),
			Op.END
		];
		reload(60, 30, STRIP_H, 'bwr', bc(...main, ...sub));

		const fb1 = run();
		expect(pixel(fb1, 30, 15)).toEqual([0, 0, 0]);

		const fb2 = fireEvent(0)!;
		expect(fb2).not.toBeNull();
		expect(pixel(fb2, 10 + 5, 5 + 2)).toEqual([255, 0, 0]);
		expect(pixel(fb2, 10 + 14, 5 + 7)).toEqual([255, 0, 0]);
		expect(pixel(fb2, 10 + 0, 5 + 0)).toEqual([255, 255, 255]);
		expect(pixel(fb2, 0, 0)).toEqual([0, 0, 0]);
	});
});

describe('setWindow: consecutive renders', () => {
	test('render-render resets win_filled', () => {
		const code = bc(setWindow(0, 0, 40, 20, 80, 80, 80), setColor(255, 0, 0), rectFill(10, 5, 10, 10), Op.END);
		reload(40, 20, STRIP_H, 'rgb', code);
		const fb1 = run();
		expect(pixel(fb1, 15, 10)).toEqual([255, 0, 0]);
		expect(pixel(fb1, 0, 0)).toEqual([80, 80, 80]);

		const fb2 = run();
		expect(pixel(fb2, 15, 10)).toEqual([255, 0, 0]);
		expect(pixel(fb2, 0, 0)).toEqual([80, 80, 80]);
	});
});

describe('setWindow: strip boundary precision', () => {
	test('window starting at non-strip-aligned y', () => {
		reload(40, 20, STRIP_H, 'rgb', bc(
			setWindow(0, 3, 40, 14, 100, 0, 0), Op.END
		));
		const fb = run();
		expect(pixel(fb, 20, 2)).toEqual([255, 255, 255]);
		expect(pixel(fb, 20, 3)).toEqual([100, 0, 0]);
		expect(pixel(fb, 20, 16)).toEqual([100, 0, 0]);
		expect(pixel(fb, 20, 17)).toEqual([255, 255, 255]);
	});

	test('drawing at strip boundary y=4', () => {
		const code = bc(
			setWindow(0, 0, 40, 20, 50, 50, 50),
			setColor(255, 255, 0), rectFill(10, 3, 20, 2),
			Op.END
		);
		reload(40, 20, STRIP_H, 'rgb', code);
		const fb = run();
		expect(pixel(fb, 20, 3)).toEqual([255, 255, 0]);
		expect(pixel(fb, 20, 4)).toEqual([255, 255, 0]);
		expect(pixel(fb, 20, 2)).toEqual([50, 50, 50]);
		expect(pixel(fb, 20, 5)).toEqual([50, 50, 50]);
	});

	test('1-pixel-tall window', () => {
		reload(40, 20, STRIP_H, 'rgb', bc(
			setWindow(10, 10, 20, 1, 0, 0, 255), Op.END
		));
		const fb = run();
		expect(pixel(fb, 20, 10)).toEqual([0, 0, 255]);
		expect(pixel(fb, 20, 9)).toEqual([255, 255, 255]);
		expect(pixel(fb, 20, 11)).toEqual([255, 255, 255]);
	});
});

describe('setWindow: different strip heights', () => {
	test('strip_h=1 works', () => {
		const code = bc(setWindow(0, 0, 20, 10, 80, 80, 80), setColor(255, 0, 0), rectFill(5, 3, 5, 4), Op.END);
		reload(20, 10, 1, 'rgb', code);
		const fb = run();
		expect(pixel(fb, 7, 5)).toEqual([255, 0, 0]);
		expect(pixel(fb, 0, 0)).toEqual([80, 80, 80]);
		expect(pixel(fb, 15, 5)).toEqual([80, 80, 80]);
	});

	test('strip_h=8 works', () => {
		const code = bc(setWindow(0, 0, 40, 24, 60, 60, 60), setColor(0, 255, 0), rectFill(5, 5, 20, 14), Op.END);
		reload(40, 24, 8, 'rgb', code);
		const fb = run();
		expect(pixel(fb, 15, 12)).toEqual([0, 255, 0]);
		expect(pixel(fb, 0, 0)).toEqual([60, 60, 60]);
		for (let y = 5; y < 19; y++)
			expect(pixel(fb, 15, y)).toEqual([0, 255, 0]);
	});

	test('strip_h equal to canvas height', () => {
		const code = bc(setWindow(0, 0, 20, 10, 40, 40, 40), setColor(200, 100, 50), rectFill(5, 3, 10, 4), Op.END);
		reload(20, 10, 10, 'rgb', code);
		const fb = run();
		expect(pixel(fb, 10, 5)).toEqual([200, 100, 50]);
		expect(pixel(fb, 0, 0)).toEqual([40, 40, 40]);
	});
});

describe('setWindow: large device', () => {
	test('800x480 with setWindow and rect', () => {
		const code = bc(
			setWindow(0, 0, 800, 480, 30, 30, 30),
			setColor(255, 0, 0), rectFill(100, 100, 200, 200),
			Op.END
		);
		reload(800, 480, STRIP_H, 'rgb', code);
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([30, 30, 30]);
		expect(pixel(fb, 200, 200)).toEqual([255, 0, 0]);
		expect(pixel(fb, 799, 479)).toEqual([30, 30, 30]);
		expect(pixel(fb, 100, 299)).toEqual([255, 0, 0]);
		expect(pixel(fb, 300, 100)).toEqual([30, 30, 30]);
	});
});
