<script lang="ts">
	import type { RuntimeConfig, ResourceEntry } from '$lib/types';
	import { onDestroy } from 'svelte';

	let {
		deviceW,
		deviceH,
		bytecodeLen = 0,
		hexView = '',
		resources = [],
		resourcesTotalSize = 0,
		runtimeConfig = $bindable({ timers: [] }),
		oncanvasReady,
		ontimerFire
	}: {
		deviceW: number;
		deviceH: number;
		bytecodeLen: number;
		hexView: string;
		resources: ResourceEntry[];
		resourcesTotalSize: number;
		runtimeConfig: RuntimeConfig;
		oncanvasReady: (canvas: HTMLCanvasElement) => void;
		ontimerFire?: (timerId: number) => void;
	} = $props();

	const PREVIEW_W = 800;
	const PREVIEW_H = 600;

	type ZoomMode = 'fit' | '1x';
	let zoomMode = $state<ZoomMode>('fit');
	let canvasScale = $derived(
		zoomMode === '1x' ? 1 : Math.min(PREVIEW_W / deviceW, PREVIEW_H / deviceH)
	);

	let canvas: HTMLCanvasElement | undefined = $state();
	let copiedTarget = $state('');

	let resourcesHex = $derived(resources.map((r) => r.hex).join('\n'));

	$effect(() => {
		if (canvas) oncanvasReady(canvas);
	});

	const timerHandles = new Map<number, ReturnType<typeof setInterval>>();

	$effect(() => {
		const active = new Set<number>();
		for (const timer of runtimeConfig.timers) {
			if (timer.enabled && timer.intervalMs > 0) {
				active.add(timer.id);
				if (!timerHandles.has(timer.id)) {
					const handle = setInterval(() => fireTimer(timer.id), timer.intervalMs);
					timerHandles.set(timer.id, handle);
				}
			}
		}
		for (const [id, handle] of timerHandles) {
			if (!active.has(id)) {
				clearInterval(handle);
				timerHandles.delete(id);
			}
		}
	});

	onDestroy(() => {
		for (const handle of timerHandles.values()) clearInterval(handle);
		timerHandles.clear();
	});

	async function copyHex(text: string, target: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedTarget = target;
			setTimeout(() => (copiedTarget = ''), 1500);
		} catch {}
	}

	function fireTimer(id: number) {
		if (ontimerFire) ontimerFire(id);
	}

	function addTimer() {
		const nextId = runtimeConfig.timers.length > 0
			? Math.max(...runtimeConfig.timers.map((t) => t.id)) + 1
			: 0;
		runtimeConfig = {
			...runtimeConfig,
			timers: [...runtimeConfig.timers, { id: nextId, intervalMs: 1000, enabled: false }]
		};
	}

	function removeTimer(id: number) {
		runtimeConfig = {
			...runtimeConfig,
			timers: runtimeConfig.timers.filter((t) => t.id !== id)
		};
	}

	function updateTimerInterval(id: number, ms: number) {
		if (timerHandles.has(id)) {
			clearInterval(timerHandles.get(id)!);
			timerHandles.delete(id);
		}
		runtimeConfig = {
			...runtimeConfig,
			timers: runtimeConfig.timers.map((t) => (t.id === id ? { ...t, intervalMs: ms } : t))
		};
	}

	function toggleTimerEnabled(id: number) {
		runtimeConfig = {
			...runtimeConfig,
			timers: runtimeConfig.timers.map((t) =>
				t.id === id ? { ...t, enabled: !t.enabled } : t
			)
		};
	}
</script>

<div class="flex shrink-0 flex-col gap-3">
	<div>
		<div class="mb-1 flex items-center gap-2">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500">
				Device ({deviceW}×{deviceH})
			</h2>
			<div class="flex rounded border border-slate-600 text-xs">
				<button
					class="px-2 py-0.5 transition-colors {zoomMode === 'fit'
						? 'bg-cyan-600 text-white'
						: 'bg-slate-800 text-slate-400 hover:text-slate-200'}"
					onclick={() => (zoomMode = 'fit')}
				>
					Fit
				</button>
				<button
					class="px-2 py-0.5 transition-colors {zoomMode === '1x'
						? 'bg-cyan-600 text-white'
						: 'bg-slate-800 text-slate-400 hover:text-slate-200'}"
					onclick={() => (zoomMode = '1x')}
				>
					1×
				</button>
			</div>
			<span class="text-xs text-slate-600">{Math.round(canvasScale * 100)}%</span>
		</div>
		<div
			class="flex overflow-hidden rounded border border-slate-700 bg-black"
			style="width:{PREVIEW_W}px;height:{PREVIEW_H}px"
		>
			<canvas
				bind:this={canvas}
				width={deviceW}
				height={deviceH}
				style="width:{deviceW * canvasScale}px;height:{deviceH * canvasScale}px;min-width:{deviceW * canvasScale}px;min-height:{deviceH * canvasScale}px;margin:auto"
				class="block [image-rendering:pixelated]"
			></canvas>
		</div>
	</div>

	<!-- Event Timers -->
	<div class="rounded border border-slate-700 bg-slate-800 p-3" style="max-width:{PREVIEW_W}px">
		<div class="mb-1 flex items-center gap-2">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500">Event Timers</h2>
			<button
				onclick={addTimer}
				class="rounded bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300 transition-colors hover:bg-slate-600"
			>
				+ Add
			</button>
		</div>
		{#each runtimeConfig.timers as timer}
			<div class="mb-1 flex items-center gap-2">
				<label class="flex items-center gap-1">
					<input
						type="checkbox"
						checked={timer.enabled}
						onchange={() => toggleTimerEnabled(timer.id)}
						class="accent-cyan-500"
					/>
					<span class="text-[10px] text-slate-400">E{timer.id}</span>
				</label>
				<input
					type="number"
					value={timer.intervalMs}
					oninput={(e) => updateTimerInterval(timer.id, parseInt(e.currentTarget.value) || 0)}
					min="100"
					class="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-200"
				/>
				<span class="text-[10px] text-slate-500">ms</span>
				<button
					onclick={() => fireTimer(timer.id)}
					class="rounded bg-amber-700 px-2 py-0.5 text-[10px] text-amber-200 transition-colors hover:bg-amber-600"
				>
					⚡ Fire
				</button>
				<button
					onclick={() => removeTimer(timer.id)}
					class="text-[10px] text-slate-500 transition-colors hover:text-red-400"
				>
					✕
				</button>
			</div>
		{/each}
		{#if runtimeConfig.timers.length === 0}
			<span class="text-[10px] text-slate-600">No event timers configured</span>
		{/if}
	</div>

	<!-- Bytecode + Resources side by side -->
	<div class="flex gap-3" style="max-width:{PREVIEW_W}px">
		<div class="flex flex-1 items-center gap-1">
			<span class="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500">
				{copiedTarget === 'bc' ? '✓ Copied' : `ByteCode (${bytecodeLen} B)`}
			</span>
			<input
				type="text"
				readonly
				value={hexView}
				onclick={(e) => { e.currentTarget.select(); copyHex(hexView, 'bc'); }}
				class="min-w-0 flex-1 cursor-pointer rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-300 outline-none focus:border-cyan-500"
			/>
		</div>

		<div class="flex flex-1 items-center gap-1">
			<span class="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500">
				{copiedTarget === 'res' ? '✓ Copied' : `Resource (${resourcesTotalSize} B)`}
			</span>
			<input
				type="text"
				readonly
				value={resourcesHex}
				onclick={(e) => { e.currentTarget.select(); copyHex(resourcesHex, 'res'); }}
				class="min-w-0 flex-1 cursor-pointer rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-300 outline-none focus:border-cyan-500"
			/>
		</div>
	</div>
</div>
