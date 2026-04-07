<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import {
		BleTransferManager,
		type BleStatus,
		type BleLogEntry,
		type AuthorizedDevice
	} from '$lib/ble/ble-transfer';
	import { bleSelectedDeviceId } from '$lib/stores/compiler-store';

	import type { ResourceEntry } from '$lib/types';

	let {
		canvas,
		bytecode = new Uint8Array(),
		resources = []
	}: {
		canvas: HTMLCanvasElement | undefined;
		bytecode?: Uint8Array;
		resources?: ResourceEntry[];
	} = $props();

	const ble = new BleTransferManager();

	let status = $state<BleStatus>('disconnected');
	let logs = $state<BleLogEntry[]>([]);
	let devices = $state<AuthorizedDevice[]>([]);
	let selectedId = $state('');
	let progress = $state(0);
	let progressMsg = $state('');
	let showLog = $state(false);
	let toastMsg = $state('');
	let toastTimer = 0;

	onMount(() => {
		ble.onStatusChange = (s) => { status = s; };
		ble.onLog = (e) => { logs = [...logs.slice(-99), e]; };
		ble.onProgress = (pct, msg) => { progress = pct; progressMsg = msg; };
		ble.onDevicesChanged = () => { refreshDevices(); };
		// Restore last selected device from persisted store
		selectedId = get(bleSelectedDeviceId);
		bleSelectedDeviceId.subscribe((v) => { if (v !== selectedId) selectedId = v; });
		initDevices();
	});

	async function initDevices() {
		await refreshDevices();
		// Auto-reconnect only works when getDevices() returns the device
		// (requires chrome://flags/#enable-web-bluetooth-new-permissions-backend)
		// requestDevice() requires user gesture, so we can't auto-connect otherwise
		if (selectedId) {
			const dev = devices.find((d) => d.id === selectedId);
			if (dev?.authorized) {
				ble.connectById(selectedId);
			}
		}
	}

	function saveSelectedId(id: string) {
		selectedId = id;
		bleSelectedDeviceId.set(id);
	}

	async function refreshDevices() {
		devices = await ble.getAuthorizedDevices();
		if (devices.length > 0 && !devices.find((d) => d.id === selectedId)) {
			saveSelectedId(devices[0].id);
		}
	}

	/** Convert canvas to two packed planes: BW + Red.
	 *  Convention: 0=white, 1=black (BW plane), 1=red (Red plane). */
	function canvasToThreeColor(cvs: HTMLCanvasElement): Uint8Array {
		const ctx = cvs.getContext('2d');
		if (!ctx) return new Uint8Array(0);
		const { width, height, data } = ctx.getImageData(0, 0, cvs.width, cvs.height);
		const n = width * height;
		const byteLen = Math.ceil(n / 8);
		const bw = new Uint8Array(byteLen);   // 0=white, 1=black
		const red = new Uint8Array(byteLen);   // 0=white, 1=red
		for (let i = 0; i < n; i++) {
			const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
			const bit = 0x80 >> (i & 7);
			const idx = i >> 3;
			if (r > 128 && g < 100 && b < 100) {
				red[idx] |= bit;   // 1=red
			} else {
				const gray = 0.299 * r + 0.587 * g + 0.114 * b;
				if (gray < 128) bw[idx] |= bit;   // 1=black
			}
		}
		const out = new Uint8Array(byteLen * 2);
		out.set(bw, 0);
		out.set(red, byteLen);
		return out;
	}

	function findDevice(id: string): AuthorizedDevice | undefined {
		return devices.find((d) => d.id === id);
	}

	/** Connect or re-scan depending on authorization status */
	async function connectDevice(id: string): Promise<boolean> {
		const dev = findDevice(id);
		if (dev?.authorized) {
			return ble.connectById(id);
		} else {
			// Device is IDB-only; need re-scan to re-authorize
			const ok = await ble.scanNew();
			if (ok) await refreshDevices();
			return ok;
		}
	}

	async function handleSelect(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		if (val === '__scan__') {
			ble.disconnect();
			saveSelectedId('');
			const ok = await ble.scanNew();
			if (ok) await refreshDevices();
		} else if (val !== selectedId) {
			ble.disconnect();
			saveSelectedId(val);
			if (val) await connectDevice(val);
		}
	}

	async function handleSend() {
		if (!canvas) return;
		if (!ble.isConnected) {
			let ok = false;
			if (selectedId) {
				ok = await connectDevice(selectedId);
			} else {
				ok = await ble.scanNew();
				if (ok) await refreshDevices();
			}
			if (!ok) return;
		}
		progress = 0;
		progressMsg = '';
		const img = canvasToThreeColor(canvas);
		if (img.length === 0) return;
		const ok = await ble.transferImage(img);
		if (ok) {
			clearTimeout(toastTimer);
			toastMsg = 'Transfer complete!';
			toastTimer = window.setTimeout(() => { toastMsg = ''; }, 2500);
		}
	}

	async function handleVmStore() {
		if (!ble.isConnected) {
			let ok = false;
			if (selectedId) {
				ok = await connectDevice(selectedId);
			} else {
				ok = await ble.scanNew();
				if (ok) await refreshDevices();
			}
			if (!ok) return;
		}
		progress = 0;
		progressMsg = '';
		const fontRes = resources.find((r) => r.group === 'font');
		const ok = await ble.transferGvmb(bytecode, fontRes?.data ?? null);
		if (ok) {
			clearTimeout(toastTimer);
			toastMsg = 'VM Store complete!';
			toastTimer = window.setTimeout(() => { toastMsg = ''; }, 2500);
		}
	}

	const connected = $derived(status === 'connected' || status === 'transferring');
	const busy = $derived(status === 'scanning' || status === 'connecting' || status === 'transferring');

	function devLabel(dev: AuthorizedDevice): string {
		if (dev.id === selectedId && connected) return `✓ ${dev.name}`;
		if (!dev.authorized) return `⏻ ${dev.name}`; // IDB-only, needs re-scan
		if (dev.nearby) return `📶 ${dev.name}`;
		return dev.name;
	}
</script>

{#if toastMsg}
	<div class="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
		{toastMsg}
	</div>
{/if}

<div class="flex items-center gap-1.5">
	<select
		value={selectedId}
		onchange={handleSelect}
		disabled={busy}
		class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 disabled:opacity-50"
	>
		{#each devices as dev}
			<option value={dev.id}>{devLabel(dev)}</option>
		{/each}
		<option value="__scan__">🔍 Scan new...</option>
	</select>

	<button
		onclick={handleSend}
		disabled={busy || !canvas}
		class="rounded bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
	>📡 Send</button>

	<button
		onclick={handleVmStore}
		disabled={busy || bytecode.length === 0}
		class="rounded bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-50"
	>💾 VM Store</button>

	<button
		onclick={() => (showLog = !showLog)}
		class="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-600"
	>
		{showLog ? '▾' : '▸'}
		{#if logs.length > 0}<span class="ml-0.5 text-[10px]">{logs.length}</span>{/if}
	</button>
</div>

{#if status === 'transferring' && progress > 0}
	<div class="mt-1 flex items-center gap-2">
		<div class="h-1.5 flex-1 rounded-full bg-slate-700">
			<div class="h-full rounded-full bg-violet-500 transition-all" style="width:{progress}%"></div>
		</div>
		<span class="text-[10px] text-slate-400">{progressMsg}</span>
	</div>
{/if}

{#if showLog}
	<div class="mt-1 max-h-32 overflow-y-auto rounded border border-slate-700 bg-slate-900 p-2 font-mono text-[10px] text-slate-400">
		{#each logs as entry}
			<div><span class="text-slate-600">{entry.time}</span> {#if entry.direction}<span class="text-cyan-500">{entry.direction}</span>{/if} {entry.msg}</div>
		{/each}
		{#if logs.length === 0}<div class="text-slate-600">No logs</div>{/if}
	</div>
{/if}
