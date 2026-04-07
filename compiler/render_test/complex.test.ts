// @ts-nocheck
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { loadWasm, reload, run, fireEvent, pixel, destroy } from './lib/wasm-loader';
import { Op, bc, setColor, rectFill, setWindow, circleFill, pushI32, pushF32 } from './lib/bytecode';

const STRIP_H = 4;

beforeAll(async () => { await loadWasm(); });
afterAll(() => { destroy(); });

describe('isolate: no setWindow, just drawing', () => {
	test('black rect on white default bg', () => {
		reload(40, 20, STRIP_H, 'rgb', bc(
			setColor(0, 0, 0), rectFill(5, 5, 10, 10), Op.END
		));
		const fb = run();
		expect(pixel(fb, 10, 10)).toEqual([0, 0, 0]);
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
	});

	test('two rects, no setWindow', () => {
		reload(60, 20, STRIP_H, 'rgb', bc(
			setColor(255, 0, 0), rectFill(5, 5, 10, 10),
			setColor(0, 0, 255), rectFill(25, 5, 10, 10),
			Op.END
		));
		const fb = run();
		expect(pixel(fb, 10, 10)).toEqual([255, 0, 0]);
		expect(pixel(fb, 30, 10)).toEqual([0, 0, 255]);
		expect(pixel(fb, 0, 0)).toEqual([255, 255, 255]);
	});
});

describe('isolate: setWindow first, then drawing', () => {
	test('setWindow(dark) then red rect', () => {
		reload(40, 20, STRIP_H, 'rgb', bc(
			setWindow(0, 0, 40, 20, 40, 40, 40),
			setColor(255, 0, 0), rectFill(10, 5, 10, 10),
			Op.END
		));
		const fb = run();
		expect(pixel(fb, 15, 10)).toEqual([255, 0, 0]);
		expect(pixel(fb, 0, 0)).toEqual([40, 40, 40]);
	});
});

describe('isolate: drawing THEN setWindow', () => {
	test('red rect at (5,5) then setWindow at (0,0) with dark bg', () => {
		reload(40, 20, STRIP_H, 'rgb', bc(
			setColor(255, 0, 0), rectFill(5, 5, 10, 10),
			setWindow(0, 0, 40, 20, 40, 40, 40),
			Op.END
		));
		const fb = run();
		// strip_bg starts as white (from vm_prepare_screen)
		// strip 0 cleared with white, rect drawn red, setWindow sets strip_bg=dark
		// strip_to_screen composites strip 0 → screen gets white bg + red rect
		// setWindow also fills screen with dark via win_filled guard (strip 0 only)
		// BUT strip_to_screen runs AFTER bytecode, so it overwrites the screen fill
		// Result: strip 0 has white bg + red rect
		console.log('rect then setWindow:');
		console.log('  (0,0):', pixel(fb, 0, 0));
		console.log('  (10,10):', pixel(fb, 10, 10));
		console.log('  (20,15):', pixel(fb, 20, 15));

		// What we expect: white bg outside rect on strip 0, dark on later strips
		// Because strip 0 uses stale white, later strips use correct dark
		// BUT setWindow filled screen with dark first, then strip 0 composites
		// white over it. Later strips composite dark over dark (correct).
	});

	test('probe strip 0 vs later strips with pre-setWindow drawing', () => {
		reload(40, 20, STRIP_H, 'rgb', bc(
			setColor(255, 0, 0), rectFill(5, 0, 10, 20),
			setWindow(0, 0, 40, 20, 40, 40, 40),
			Op.END
		));
		const fb = run();
		console.log('red column then setWindow(dark):');
		for (let y = 0; y < 20; y += 2) {
			console.log(`  y=${y}: col red=(${pixel(fb, 10, y)}), col bg=(${pixel(fb, 25, y)})`);
		}
	});
});

describe('isolate: setWindow then drawing then setWindow', () => {
	test('two setWindow calls in one program', () => {
		reload(60, 20, STRIP_H, 'rgb', bc(
			setWindow(0, 0, 30, 20, 40, 40, 40),
			setColor(255, 0, 0), rectFill(5, 5, 20, 10),
			setWindow(30, 0, 30, 20, 80, 80, 80),
			setColor(0, 0, 255), rectFill(5, 5, 20, 10),
			Op.END
		));
		const fb = run();
		console.log('two setWindow calls:');
		console.log('  left window bg (2,2):', pixel(fb, 2, 2));
		console.log('  left rect (10,10):', pixel(fb, 10, 10));
		console.log('  right window bg (32,2):', pixel(fb, 32, 2));
		console.log('  right rect (40,10):', pixel(fb, 40, 10));
		console.log('  right window bg (55,15):', pixel(fb, 55, 15));
	});
});

describe('isolate: sdk_demo pattern reproduction', () => {
	test('setWindow first, then grid of rects', () => {
		const W = 100, H = 80;
		reload(W, H, STRIP_H, 'rgb', bc(
			setWindow(0, 0, W, H, 40, 40, 40),
			setColor(0, 0, 0), rectFill(5, 5, 20, 20),
			setColor(255, 0, 0), rectFill(35, 5, 20, 20),
			setColor(0, 255, 0), rectFill(5, 35, 20, 20),
			setColor(0, 0, 255), rectFill(35, 35, 20, 20),
			Op.END
		));
		const fb = run();
		expect(pixel(fb, 0, 0)).toEqual([40, 40, 40]);
		expect(pixel(fb, 15, 15)).toEqual([0, 0, 0]);
		expect(pixel(fb, 45, 15)).toEqual([255, 0, 0]);
		expect(pixel(fb, 15, 45)).toEqual([0, 255, 0]);
		expect(pixel(fb, 45, 45)).toEqual([0, 0, 255]);
	});

	test('rects before setWindow, then circleFill after (user repro)', () => {
		const W = 400, H = 300;
		const parts: number[] = [];

		for (let row = 0; row < 5; row++) {
			for (let col = 0; col < 8; col++) {
				const x = 10 + col * 48;
				const y = 10 + row * 55;
				parts.push(...setColor(0, 0, 0));
				parts.push(...rectFill(x, y, 40, 45));
			}
		}

		parts.push(...setWindow(50, 50, 300, 200, 0, 0, 0));
		parts.push(...setColor(255, 0, 0));
		parts.push(...circleFill(50, 50, 40));
		parts.push(Op.END);

		reload(W, H, STRIP_H, 'rgb', bc(...parts));
		const fb = run();

		console.log('=== User repro: rects before setWindow ===');
		// Rects are at screen coordinates with default window (0,0,W,H)
		// Before setWindow, canvas_w=W, win_x=0, win_y=0 (from vm_prepare_screen)
		// rect at (10,10,40,45) should appear on screen at (10,10) ... but which window?
		console.log('Rect (10,10) at screen (10,10):', pixel(fb, 10, 10));
		console.log('Rect (10,10) outside setWindow, on strip 0:', pixel(fb, 15, 2));
		console.log('Rect (10,10) outside setWindow, on strip 2:', pixel(fb, 15, 10));

		// After setWindow(50,50,300,200), canvas maps to screen at offset (50,50)
		// Circle at canvas (50,50) → screen (100,100)
		console.log('Circle center at screen (100,100):', pixel(fb, 100, 100));
		console.log('Window bg at screen (60,60):', pixel(fb, 60, 60));
		console.log('Outside all at screen (5,5):', pixel(fb, 5, 5));
		console.log('Outside window at screen (360,260):', pixel(fb, 360, 260));

		// Key question: are the rects visible?
		let blackOutsideWindow = 0;
		for (let y = 10; y < 55; y++) {
			for (let x = 10; x < 50; x++) {
				const [r, g, b] = pixel(fb, x, y);
				if (r === 0 && g === 0 && b === 0) blackOutsideWindow++;
			}
		}
		console.log('Black pixels in first rect area (10,10)-(50,55):', blackOutsideWindow);
	});
});
