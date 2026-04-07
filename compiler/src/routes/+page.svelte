<script lang="ts">
	import { compile, bytecodeToHex, extractTextChars } from '$lib/compiler/compiler-wasm';
	import { dslToIR } from '$lib/compiler/dsl-compiler';
	import { compileFontResource } from '$lib/compiler/font-compiler';
	import { formatIR } from '$lib/compiler/ir-formatter';
	import { runSdkCode } from '$lib/compiler/sdk-runner';
	import type { SubFunctionEntry } from '$lib/compiler/sdk-runner';
	import { loadWasm, reload, run, fireEvent, destroyVm } from '$lib/compiler/vm-wasm';
	import type { ColorMode } from '$lib/compiler/vm-wasm';
	import { buildBundle, writeToDirectory, pickDirectory } from '$lib/compiler/bundle';
	import { idbGet, idbSet, downloadFilename as downloadFilenameStore, resIndex as resIndexStore, colorMode as colorModeStore } from '$lib/stores/compiler-store';
	import { onMount, untrack } from 'svelte';
	import { base } from '$app/paths';
	import type { IR } from '$lib/compiler/ir';
	import type { ResourceEntry, ExampleEntry, RuntimeConfig } from '$lib/types';
	import DslEditor from '../components/DslEditor.svelte';
	import ResourcePanel from '../components/ResourcePanel.svelte';
	import PreviewPanel from '../components/PreviewPanel.svelte';
	import DownloadPanel from '../components/DownloadPanel.svelte';
	import BluetoothPanel from '../components/BluetoothPanel.svelte';

	const STRIP_H = 4;

	const RESOLUTIONS = [
		{ label: '800×480', w: 800, h: 480 },
		{ label: '400×300', w: 400, h: 300 },
		{ label: '320×240', w: 320, h: 240 },
		{ label: '160×120', w: 160, h: 120 }
	];

	const COLOR_MODES: { label: string; value: ColorMode }[] = [
		{ label: 'BWR (黑白红)', value: 'bwr' },
		{ label: 'BW (黑白)', value: 'bw' },
		{ label: 'RGB (全彩)', value: 'rgb' }
	];

	type InputMode = 'dsl' | 'sdk';
	let inputMode = $state<InputMode>('dsl');

	let resIndex = $state(1);
	resIndexStore.subscribe((v) => { if (v !== resIndex) resIndex = v; });
	$effect(() => { resIndexStore.set(resIndex); });
	let deviceW = $derived(RESOLUTIONS[resIndex].w);
	let deviceH = $derived(RESOLUTIONS[resIndex].h);

	let colorModeVal = $state<ColorMode>('bwr');
	colorModeStore.subscribe((v) => { if (v !== colorModeVal) colorModeVal = v as ColorMode; });
	$effect(() => { colorModeStore.set(colorModeVal); });

	let dslText = $state('');
	let sdkText = $state('');
	let extraChars = $state('');
	let bytecode = $state<Uint8Array>(new Uint8Array());
	let hexView = $state('');
	let irView = $state('');
	let errorMsg = $state('');
	let wasmReady = $state(false);
	let canvas: HTMLCanvasElement | undefined = $state();
	let fontSize = $state(14);
	let fontFamily = $state('monospace');
	let examples = $state<ExampleEntry[]>([]);
	let selectedExample = $state('');
	let resources = $state<ResourceEntry[]>([]);
	let downloadFilename = $state('graphvm.gvmb');
	// Two-way sync with persisted store
	downloadFilenameStore.subscribe((v) => { if (v !== downloadFilename) downloadFilename = v; });
	$effect(() => { downloadFilenameStore.set(downloadFilename); });
	let toastMsg = $state('');
	let toastTimer = 0;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let outputDirHandle = $state<any>(null);
	let outputDirName = $state('');
	let subFunctions = $state<SubFunctionEntry[]>([]);
	let runtimeConfig = $state<RuntimeConfig>({
		timers: []
	});

	let editorText = $derived(inputMode === 'sdk' ? sdkText : dslText);
	let dslChars = $derived(extractTextChars(dslText));
	let resourcesTotalSize = $derived(resources.reduce((sum, r) => sum + r.size, 0));
	let filteredExamples = $derived(
		examples.filter((ex) => !ex.modes || ex.modes.includes(colorModeVal))
	);

	type LeftTab = 'editor' | 'ir' | 'resources';
	let leftTab = $state<LeftTab>('editor');

	onMount(async () => {
		try {
			await loadWasm();
			wasmReady = true;
		} catch (e) {
			errorMsg = 'WASM load failed: ' + String(e);
		}

		try {
			const res = await fetch(`${base}/examples/list.json`);
			if (res.ok) {
				examples = await res.json();
				const first = examples.find((ex) => !ex.modes || ex.modes.includes(colorModeVal));
				if (first) {
					selectedExample = first.file;
					loadExample(first);
				}
			}
		} catch {}

		// Restore saved directory handle from IndexedDB
		try {
			const saved = await idbGet<FileSystemDirectoryHandle>('outputDirHandle');
			if (saved) {
				const perm = await (saved as any).queryPermission({ mode: 'readwrite' });
				if (perm === 'granted') {
					outputDirHandle = saved;
					outputDirName = saved.name;
				}
			}
		} catch {}
	});

	$effect(() => {
		console.log('[effect] Triggered by dependencies:', {
			extraChars,
			fontSize,
			fontFamily,
			editorText: editorText.substring(0, 50),
			deviceW,
			deviceH,
			inputMode,
			colorModeVal
		});
		void extraChars;
		void fontSize;
		void fontFamily;
		void editorText;
		void deviceW;
		void deviceH;
		void inputMode;
		void colorModeVal;
		if (wasmReady && canvas) {
			untrack(() => {
				doCompileAndRun();
			});
		}
	});

	function reloadAndRun(code: Uint8Array, fontRes?: Uint8Array) {
		if (!canvas) return;
		const flash = fontRes
			? new Uint8Array([...code, ...fontRes])
			: code;
		reload(deviceW, deviceH, STRIP_H, colorModeVal,
			flash, 0, code.length,
			fontRes ? code.length : 0, fontRes ? fontRes.length : 0);
		const imageData = run();
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.putImageData(imageData, 0, 0);
	}

	function extractIRTextChars(ir: IR[]): string[] {
		const set = new Set<string>();
		for (const inst of ir) {
			if (inst.op === 'text') {
				for (const ch of inst.content) {
					if (ch.trim().length > 0) set.add(ch);
				}
			}
		}
		return [...set].sort();
	}

	function collectFontChars(baseChars: string[]): string[] {
		const set = new Set(baseChars);
		for (const ch of extraChars) {
			if (ch.trim().length > 0) set.add(ch);
		}
		return [...set].sort();
	}

	function buildFontResources(chars: string[]): ResourceEntry[] {
		if (chars.length === 0) return [];
		const fontRes = compileFontResource(chars, fontSize, fontFamily);
		return [{
			name: `font_${fontFamily}_${fontSize}px`,
			group: 'font',
			size: fontRes.length,
			hex: bytecodeToHex(fontRes),
			data: fontRes
		}];
	}

	function doCompileAndRun() {
		if (!wasmReady || !canvas) return;
		console.log('[doCompileAndRun] Starting compilation...');
		
		// Snapshot current timer config to avoid creating reactive dependencies
		const currentTimers = runtimeConfig.timers.slice();
		
		try {
			let bc: Uint8Array;
			if (inputMode === 'sdk') {
				const result = runSdkCode(sdkText);
				const irChars = extractIRTextChars(result.ir);
				const chars = collectFontChars(irChars);
				resources = buildFontResources(chars);
				bc = result.bytecode;
				irView = formatIR(result.ir);
				subFunctions = result.subFunctions;

				// Auto-configure timers from sub-function definitions
				if (subFunctions.length > 0) {
					const newTimers = subFunctions
						.filter((sf) => sf.timerId !== undefined)
						.map((sf) => ({
							id: sf.timerId!,
							intervalMs:
								currentTimers.find((t) => t.id === sf.timerId)?.intervalMs ?? 1000,
							enabled: false // Always disabled by default
						}));
					// Merge: keep existing timer settings, add new ones from sub-functions
					const existingIds = new Set(newTimers.map((t) => t.id));
					const kept = currentTimers.filter((t) => !existingIds.has(t.id));
					const mergedTimers = [...newTimers, ...kept];
					
					// Only update if timers actually changed
					const timersChanged = mergedTimers.length !== currentTimers.length ||
						mergedTimers.some((t) => {
							const existing = currentTimers.find(et => et.id === t.id);
							return !existing;
						});
					
					if (timersChanged) {
						runtimeConfig = {
							...runtimeConfig,
							timers: mergedTimers
						};
					}
				}
			} else {
				const chars = collectFontChars(dslChars);
				resources = buildFontResources(chars);
				const ir = dslToIR(dslText);
				irView = formatIR(ir);
				bc = compile(dslText);
				subFunctions = [];
			}
			bytecode = bc;
			hexView = bytecodeToHex(bc);
			errorMsg = '';
			const fontRes = resources.find(r => r.group === 'font');
			reloadAndRun(bc, fontRes?.data);
		} catch (e) {
			errorMsg = String(e);
		}
	}

	function findExample(file: string): ExampleEntry | undefined {
		return examples.find((ex) => ex.file === file);
	}

	async function loadExample(entry: ExampleEntry) {
		if (!entry.file) return;
		const newMode: InputMode = entry.type === 'sdk' ? 'sdk' : 'dsl';
		try {
			const res = await fetch(`${base}/examples/${entry.file}`);
			if (res.ok) {
				const text = await res.text();
				if (newMode === 'sdk') {
					sdkText = text;
				} else {
					dslText = text;
				}
				inputMode = newMode;
			}
		} catch (e) {
			errorMsg = 'Failed to load example: ' + String(e);
		}
	}

	function handleExampleSelect(file: string) {
		selectedExample = file;
		const entry = findExample(file);
		if (entry) loadExample(entry);
	}

	function handleEditorInput(text: string) {
		if (inputMode === 'sdk') {
			sdkText = text;
		} else {
			dslText = text;
		}
	}

	function handleCanvasReady(el: HTMLCanvasElement) {
		canvas = el;
	}

	function handleTimerFire(timerId: number) {
		if (!wasmReady || !canvas) return;
		try {
			const imageData = fireEvent(timerId);
			if (imageData) {
				const ctx = canvas.getContext('2d');
				if (ctx) ctx.putImageData(imageData, 0, 0);
			}
		} catch (e) {
			errorMsg = 'Timer fire error: ' + String(e);
		}
	}

	function getCurrentBundle(): Uint8Array | null {
		if (bytecode.length === 0) return null;
		return buildBundle(bytecode, resources, runtimeConfig, deviceW, deviceH, subFunctions, colorModeVal);
	}

	async function handleDownload() {
		if (bytecode.length === 0) return;
		try {
			if (!outputDirHandle) {
				outputDirHandle = await pickDirectory();
				outputDirName = outputDirHandle.name;
				await idbSet('outputDirHandle', outputDirHandle);
			}
			const perm = await outputDirHandle.queryPermission({ mode: 'readwrite' });
			if (perm !== 'granted') {
				const req = await outputDirHandle.requestPermission({ mode: 'readwrite' });
				if (req !== 'granted') {
					errorMsg = 'Directory permission denied';
					return;
				}
			}
			const bundle = getCurrentBundle()!;
			const fname = downloadFilename.trim() || 'graphvm.gvmb';
			await writeToDirectory(outputDirHandle, fname, bundle);
			errorMsg = '';
			clearTimeout(toastTimer);
			toastMsg = '文件更新成功!';
			toastTimer = window.setTimeout(() => { toastMsg = ''; }, 2500);
		} catch (e) {
			if ((e as DOMException)?.name === 'AbortError') return;
			errorMsg = 'Download failed: ' + String(e);
		}
	}

	function handleChangeDir() {
		outputDirHandle = null;
		outputDirName = '';
		idbSet('outputDirHandle', null);
	}
</script>

<svelte:head>
	<title>GraphVM Compiler</title>
</svelte:head>

<main class="flex min-h-screen flex-col bg-slate-900 p-4 text-slate-200">
	<div class="mb-3 flex flex-wrap items-center gap-3">
		<h1 class="text-xl font-bold text-cyan-400">GraphVM Compiler</h1>
		<span class="rounded bg-slate-700 px-2 py-0.5 text-xs">
			{wasmReady ? 'WASM ✓' : 'Loading...'}
		</span>

		<span class="rounded px-2 py-0.5 text-xs {inputMode === 'sdk' ? 'bg-amber-700 text-amber-200' : 'bg-slate-700 text-slate-300'}">
			{inputMode === 'sdk' ? 'SDK' : 'DSL'}
		</span>

		<div class="mx-2 h-5 w-px bg-slate-700"></div>

		<label class="flex items-center gap-1.5 text-sm text-slate-400">
			Device
			<select
				bind:value={resIndex}
				class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-200"
			>
				{#each RESOLUTIONS as res, i}
					<option value={i}>{res.label}</option>
				{/each}
			</select>
		</label>

		<label class="flex items-center gap-1.5 text-sm text-slate-400">
			Color
			<select
				bind:value={colorModeVal}
				class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-200"
			>
				{#each COLOR_MODES as cm}
					<option value={cm.value}>{cm.label}</option>
				{/each}
			</select>
		</label>

		<label class="flex items-center gap-1.5 text-sm text-slate-400">
			Font
			<input
				type="number"
				bind:value={fontSize}
				min="8"
				max="48"
				class="w-14 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-200"
			/>
			<select
				bind:value={fontFamily}
				class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-200"
			>
				<option value="monospace">monospace</option>
				<option value="sans-serif">sans-serif</option>
				<option value="serif">serif</option>
			</select>
		</label>
	</div>

	{#if toastMsg}
		<div class="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-opacity">
			{toastMsg}
		</div>
	{/if}

	{#if errorMsg}
		<div class="mb-3 rounded bg-red-900/50 px-3 py-2 font-mono text-sm text-red-400">
			{errorMsg}
		</div>
	{/if}

	<div class="flex min-h-0 flex-1 gap-4">
		<div class="flex min-w-0 flex-1 flex-col">
			<div class="mb-1 flex items-center gap-1">
				<button
					class="rounded-t px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors {leftTab === 'editor'
						? 'bg-slate-800 text-cyan-400'
						: 'text-slate-500 hover:text-slate-300'}"
					onclick={() => (leftTab = 'editor')}
				>
					{inputMode === 'sdk' ? 'SDK Editor' : 'DSL Editor'}
				</button>
				<button
					class="rounded-t px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors {leftTab === 'ir'
						? 'bg-slate-800 text-cyan-400'
						: 'text-slate-500 hover:text-slate-300'}"
					onclick={() => (leftTab = 'ir')}
				>
					IR
					{#if irView}
						<span class="ml-1 rounded-full bg-slate-600 px-1.5 text-[10px] text-slate-300">{irView.split('\n').length}</span>
					{/if}
				</button>
				<button
					class="rounded-t px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors {leftTab === 'resources'
						? 'bg-slate-800 text-cyan-400'
						: 'text-slate-500 hover:text-slate-300'}"
					onclick={() => (leftTab = 'resources')}
				>
					Resources
					{#if resources.length > 0}
						<span class="ml-1 rounded-full bg-slate-600 px-1.5 text-[10px] text-slate-300">{resources.length}</span>
					{/if}
				</button>
			</div>

			{#if leftTab === 'editor'}
				<DslEditor
					text={editorText}
					ontext={handleEditorInput}
					{selectedExample}
					examples={filteredExamples}
					onloadExample={handleExampleSelect}
					mode={inputMode}
				/>
			{:else if leftTab === 'ir'}
				<div class="flex h-full flex-col">
					<div class="mb-1 flex items-center gap-2">
						<h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500">
							Intermediate Representation
						</h2>
						<span class="text-xs text-slate-600">
							{irView ? irView.split('\n').length + ' instructions' : 'No IR'}
						</span>
					</div>
					<textarea
						readonly
						value={irView}
						spellcheck="false"
						class="thin-scroll w-full flex-1 resize-none rounded border border-slate-700 bg-slate-800 p-3 font-mono text-sm text-green-300 opacity-90 focus:border-cyan-400 focus:outline-none"
						style="min-height:400px"
					></textarea>
				</div>
			{:else}
				<ResourcePanel {resources} bind:extraChars {dslChars} />
			{/if}
		</div>

		<div class="flex shrink-0 flex-col items-center gap-3">
			<!-- Download & BLE panels above preview, stacked vertically -->
			<div class="flex flex-col items-center gap-2">
				<DownloadPanel
					bytecodeLen={bytecode.length}
					bind:downloadFilename
					{outputDirName}
					ondownload={handleDownload}
					onchangeDir={handleChangeDir}
				/>
				<BluetoothPanel {canvas} {bytecode} {resources} />
			</div>

			<PreviewPanel
				{deviceW}
				{deviceH}
				bytecodeLen={bytecode.length}
				{hexView}
				{resources}
				{resourcesTotalSize}
				bind:runtimeConfig
				oncanvasReady={handleCanvasReady}
				ontimerFire={handleTimerFire}
			/>
		</div>
	</div>
</main>
