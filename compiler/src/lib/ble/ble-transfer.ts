/**
 * BLE Transfer Module
 * Adapted from EPD-nRF5 streaming protocol for GraphVM canvas image transfer.
 * Flow: scan once → grant permission → getDevices() for reconnect.
 */

/// <reference path="./web-bluetooth.d.ts" />

const SERVICE_UUID = '62750001-d828-918d-fb46-b6c11c675aec';
const CHAR_WRITE_UUID = '62750002-d828-918d-fb46-b6c11c675aec';
const CHAR_VERSION_UUID = '62750003-d828-918d-fb46-b6c11c675aec';

const MSG_TYPE = { READY: 0x52, FLOW_CONTROL: 0x43 };
const STREAM_START_CMD = 0x31;
const VM_STORE_CMD = 0x40;

// ── Public types ────────────────────────────────────────────────────────────

export type BleStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'transferring';

export interface BleLogEntry {
	time: string;
	msg: string;
	direction?: '⇑' | '⇓' | '';
}

export interface AuthorizedDevice {
	name: string;
	id: string;
	nearby: boolean;
	/** true = browser still has permission (getDevices), false = saved in IDB only */
	authorized: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ts(): string {
	const d = new Date();
	return [d.getHours(), d.getMinutes(), d.getSeconds()]
		.map((n) => String(n).padStart(2, '0'))
		.join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function u16le(buf: Uint8Array, off: number, v: number) {
	buf[off] = v & 0xff;
	buf[off + 1] = (v >> 8) & 0xff;
}

function u32le(buf: Uint8Array, off: number, v: number) {
	buf[off] = v & 0xff;
	buf[off + 1] = (v >> 8) & 0xff;
	buf[off + 2] = (v >> 16) & 0xff;
	buf[off + 3] = (v >> 24) & 0xff;
}

// ── CRC32 (standard polynomial, matching zlib) ─────────────────────────────

const CRC32_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) {
			c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		}
		table[i] = c;
	}
	return table;
})();

function crc32(data: Uint8Array): number {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < data.length; i++) {
		crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Compression (pako deflateRaw windowBits=10) ─────────────────────────────

const PAKO_CDN = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pakoPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadPako(): Promise<any> {
	if ((globalThis as any).pako) return Promise.resolve((globalThis as any).pako);
	if (pakoPromise) return pakoPromise;
	pakoPromise = new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = PAKO_CDN;
		s.async = true;
		s.onload = () => resolve((globalThis as any).pako);
		s.onerror = reject;
		document.head.appendChild(s);
	});
	return pakoPromise;
}

// Preload on module init
loadPako().catch(() => { /* optional */ });

async function compress(data: Uint8Array): Promise<Uint8Array> {
	try {
		const pako = await loadPako();
		return pako.deflateRaw(data, { windowBits: 10, level: 6 }) as Uint8Array;
	} catch {
		return data; // fallback: send uncompressed (will fail on firmware expecting inflate)
	}
}

// ── Stream state ────────────────────────────────────────────────────────────

interface StreamState {
	active: boolean;
	windowSize: number;
	mtu: number;
	frames: Uint8Array[];
	total: number;
	ackStart: number;
	nextIdx: number;
	resolveReady: ((v: { windowSize: number; mtu: number }) => void) | null;
	resolveComplete: ((ok: boolean) => void) | null;
	flowTimeout: ReturnType<typeof setTimeout> | null;
	sessionTimeout: ReturnType<typeof setTimeout> | null;
	sendEpoch: number;
	calibrationResolve: ((ack: number) => void) | null;
}

function freshStream(): StreamState {
	return {
		active: false, windowSize: 10, mtu: 20,
		frames: [], total: 0, ackStart: 0, nextIdx: 0,
		resolveReady: null, resolveComplete: null,
		flowTimeout: null, sessionTimeout: null,
		sendEpoch: 0, calibrationResolve: null,
	};
}

// ── BleTransferManager ──────────────────────────────────────────────────────

export class BleTransferManager {
	private device: BluetoothDevice | null = null;
	private server: BluetoothRemoteGATTServer | null = null;
	private char: BluetoothRemoteGATTCharacteristic | null = null;
	private msgIdx = 0;
	private st: StreamState = freshStream();
	private watchAbort: AbortController | null = null;
	private nearbyIds = new Set<string>();

	onStatusChange: ((s: BleStatus) => void) | null = null;
	onLog: ((e: BleLogEntry) => void) | null = null;
	onProgress: ((pct: number, msg: string) => void) | null = null;
	onDevicesChanged: (() => void) | null = null;

	get isConnected() { return !!(this.server?.connected && this.char); }
	get deviceName() { return this.device?.name ?? ''; }

	// ── Known devices (getDevices + IDB persistence) ──────────────────────

	private async loadSavedDevices(): Promise<{ name: string; id: string }[]> {
		try {
			const { idbGet } = await import('$lib/stores/compiler-store');
			return (await idbGet<{ name: string; id: string }[]>('bleKnownDevices')) ?? [];
		} catch { return []; }
	}

	private async saveKnownDevice(name: string, id: string) {
		try {
			const { idbGet, idbSet } = await import('$lib/stores/compiler-store');
			const list = (await idbGet<{ name: string; id: string }[]>('bleKnownDevices')) ?? [];
			const idx = list.findIndex((d) => d.id === id);
			if (idx >= 0) list[idx] = { name, id };
			else list.push({ name, id });
			await idbSet('bleKnownDevices', list.slice(-10));
		} catch { /* ignore */ }
	}

	async removeKnownDevice(id: string) {
		try {
			const { idbGet, idbSet } = await import('$lib/stores/compiler-store');
			const list = (await idbGet<{ name: string; id: string }[]>('bleKnownDevices')) ?? [];
			await idbSet('bleKnownDevices', list.filter((d) => d.id !== id));
		} catch { /* ignore */ }
	}

	async getAuthorizedDevices(): Promise<AuthorizedDevice[]> {
		// Merge: browser-authorized devices + IDB-saved devices
		const saved = await this.loadSavedDevices();
		let apiDevices: BluetoothDevice[] = [];
		try { apiDevices = await navigator.bluetooth.getDevices(); } catch { /* unsupported */ }

		this.watchDevices(apiDevices);

		const apiMap = new Map(apiDevices.filter((d) => d.name).map((d) => [d.id, d]));
		const result: AuthorizedDevice[] = [];
		const seen = new Set<string>();

		// API devices first (authorized)
		for (const d of apiDevices) {
			if (!d.name || seen.has(d.id)) continue;
			seen.add(d.id);
			result.push({ name: d.name, id: d.id, nearby: this.nearbyIds.has(d.id), authorized: true });
		}

		// IDB-saved devices that aren't in API (need re-scan)
		for (const s of saved) {
			if (seen.has(s.id)) continue;
			seen.add(s.id);
			result.push({ name: s.name, id: s.id, nearby: false, authorized: false });
		}

		return result;
	}

	private watchDevices(devices: BluetoothDevice[]) {
		// Abort previous watchers
		if (this.watchAbort) this.watchAbort.abort();
		this.watchAbort = new AbortController();
		const signal = this.watchAbort.signal;

		for (const dev of devices) {
			try {
				if (dev.watchingAdvertisements) continue;
				dev.addEventListener('advertisementreceived', ((ev: BluetoothAdvertisingEvent) => {
					if (!this.nearbyIds.has(ev.device.id)) {
						this.nearbyIds.add(ev.device.id);
						this.onDevicesChanged?.();
					}
				}) as EventListener);
				dev.watchAdvertisements({ signal }).catch(() => { /* unsupported or failed */ });
			} catch { /* browser doesn't support watchAdvertisements */ }
		}
	}

	isNearby(id: string): boolean {
		return this.nearbyIds.has(id);
	}

	// ── Scan new device (requestDevice → grants permission) ───────────────

	async scanNew(): Promise<boolean> {
		this.reset();
		this.emit('scanning');
		try {
			this.device = await navigator.bluetooth.requestDevice({
				filters: [{ namePrefix: 'NRF' }],
				optionalServices: [SERVICE_UUID],
			});
			this.log(`Selected: ${this.device.name ?? this.device.id}`);
			this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
			await this.delay(300);
			return this.connectGatt();
		} catch (e) {
			this.log('Scan: ' + ((e as Error).message || String(e)));
			this.emit('disconnected');
			return false;
		}
	}

	// ── Connect to a previously authorized device ─────────────────────────

	async connectById(id: string): Promise<boolean> {
		this.reset();
		this.emit('connecting');
		try {
			// Try getDevices() first (requires new permissions backend)
			const devices = await navigator.bluetooth.getDevices();
			const dev = devices.find((d) => d.id === id);
			if (dev) {
				this.device = dev;
				this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
				this.log(`Reconnecting: ${dev.name ?? dev.id}`);
				await this.delay(300);
				return this.connectGatt();
			}
		} catch { /* getDevices not supported or empty */ }

		// Fallback: look up saved name and use requestDevice with name filter
		const saved = await this.loadSavedDevices();
		const entry = saved.find((d) => d.id === id);
		if (entry) {
			return this.connectByName(entry.name);
		}

		this.log('Device not found');
		this.emit('disconnected');
		return false;
	}

	/** Connect using requestDevice with exact name filter (minimal picker). */
	async connectByName(name: string): Promise<boolean> {
		this.reset();
		this.emit('connecting');
		try {
			this.log(`Connecting: ${name}`);
			this.device = await navigator.bluetooth.requestDevice({
				filters: [{ name }],
				optionalServices: [SERVICE_UUID],
			});
			this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
			await this.delay(300);
			return this.connectGatt();
		} catch (e) {
			this.log('Connect: ' + ((e as Error).message || String(e)));
			this.emit('disconnected');
			return false;
		}
	}

	disconnect() {
		if (this.device?.gatt?.connected) this.device.gatt.disconnect();
		this.onDisconnect();
	}

	// ── Transfer canvas image (compressed with deflate-raw) ───────────────

	async transferImage(imageData: Uint8Array): Promise<boolean> {
		if (!this.isConnected) { this.log('Not connected'); return false; }
		this.emit('transferring');
		this.log(`Image: ${imageData.length} bytes`);

		try {
			const compressed = await compress(imageData);
			const ratio = ((compressed.length / imageData.length) * 100).toFixed(1);
			this.log(`Compressed: ${imageData.length} → ${compressed.length} bytes (${ratio}%)`);

			const ok = await this.stream(compressed);
			this.emit(this.server?.connected ? 'connected' : 'disconnected');
			this.log(ok ? 'Transfer complete!' : 'Transfer failed');
			return ok;
		} catch (e) {
			this.log('Transfer: ' + ((e as Error).message || String(e)));
			this.emit(this.server?.connected ? 'connected' : 'disconnected');
			return false;
		}
	}

	// ── Transfer GVMB (bytecode + font) via VM_STORE command ─────────────

	async transferGvmb(codeData: Uint8Array, fontData: Uint8Array | null): Promise<boolean> {
		if (!this.isConnected) { this.log('Not connected'); return false; }
		this.emit('transferring');

		const codeLen = codeData.length;
		const fontLen = fontData ? fontData.length : 0;
		const raw = new Uint8Array(codeLen + fontLen);
		raw.set(codeData, 0);
		if (fontData) raw.set(fontData, codeLen);

		const rawCrc = crc32(raw);
		this.log(`GVMB: code=${codeLen}, font=${fontLen}, total=${raw.length}, CRC32=0x${rawCrc.toString(16).toUpperCase().padStart(8, '0')}`);

		try {
			const compressed = await compress(raw);
			const ratio = ((compressed.length / raw.length) * 100).toFixed(1);
			this.log(`Compressed: ${raw.length} → ${compressed.length} bytes (${ratio}%)`);

			// CMD payload: code_len(u16) + font_len(u16) + crc32(u32)
			const cmdPayload = new Uint8Array(8);
			u16le(cmdPayload, 0, codeLen);
			u16le(cmdPayload, 2, fontLen);
			u32le(cmdPayload, 4, rawCrc);

			const ok = await this.stream(compressed, VM_STORE_CMD, cmdPayload);
			this.emit(this.server?.connected ? 'connected' : 'disconnected');
			this.log(ok ? 'GVMB transfer complete!' : 'GVMB transfer failed');
			return ok;
		} catch (e) {
			this.log('GVMB: ' + ((e as Error).message || String(e)));
			this.emit(this.server?.connected ? 'connected' : 'disconnected');
			return false;
		}
	}

	// ── Private: GATT connect ─────────────────────────────────────────────

	private async connectGatt(): Promise<boolean> {
		this.emit('connecting');
		try {
			this.server = (await this.device!.gatt?.connect()) ?? null;
			if (!this.server) throw new Error('No GATT');
			const svc = await this.server.getPrimaryService(SERVICE_UUID);
			this.char = await svc.getCharacteristic(CHAR_WRITE_UUID);

			try {
				const vc = await svc.getCharacteristic(CHAR_VERSION_UUID);
				const vd = await vc.readValue();
				this.log(`Firmware: 0x${vd.getUint8(0).toString(16)}`);
			} catch { /* ok */ }

			await this.char.startNotifications();
			this.char.addEventListener('characteristicvaluechanged', ((ev: Event) => {
				const t = ev.target as BluetoothRemoteGATTCharacteristic;
				if (t.value) this.handleNotify(t.value, this.msgIdx++);
			}) as EventListener);

			this.emit('connected');
			this.log('Connected: ' + (this.device!.name ?? this.device!.id));
			// Persist to IDB for cross-session recall
			if (this.device!.name) this.saveKnownDevice(this.device!.name, this.device!.id);
			return true;
		} catch (e) {
			this.log('Connect: ' + ((e as Error).message || String(e)));
			this.onDisconnect();
			return false;
		}
	}

	// ── Private: streaming protocol ───────────────────────────────────────

	private async stream(data: Uint8Array, cmd: number = STREAM_START_CMD, cmdPayload: Uint8Array | null = null): Promise<boolean> {
		this.resetStream();
		this.st.active = true;

		if (!(await this.writeCmd(cmd, cmdPayload))) {
			this.log('Stream-start failed'); this.resetStream(); return false;
		}

		try {
			const { windowSize, mtu } = await this.waitReady(5000);
			const payloadSz = mtu - 4;
			if (payloadSz <= 0) { this.log('MTU too small'); return false; }

			this.st.frames = [];
			for (let i = 0; i < data.length; i += payloadSz) {
				this.st.frames.push(data.slice(i, Math.min(i + payloadSz, data.length)));
			}
			this.st.total = this.st.frames.length;
			this.log(`Streaming: ${this.st.total} frames, win=${windowSize}, mtu=${mtu}`);

			// Skip calibration for small transfers, just send directly
			if (this.st.total > 10) await this.calibrate(3);
			this.startSessionTimeout();
			await this.sendWindow();

			return new Promise<boolean>((r) => { this.st.resolveComplete = r; });
		} catch (e) {
			this.log('Stream: ' + ((e as Error).message || String(e)));
			this.resetStream();
			return false;
		}
	}

	private async writeCmd(cmd: number, data: Uint8Array | null): Promise<boolean> {
		if (!this.char) return false;
		try {
			const p = data ? new Uint8Array([cmd, ...data]) : new Uint8Array([cmd]);
			await this.char.writeValueWithResponse(p);
			return true;
		} catch (e) { this.log('Write: ' + ((e as Error).message || '')); return false; }
	}

	private async sendFrame(idx: number) {
		if (!this.char || idx >= this.st.total) return;
		const payload = this.st.frames[idx];
		const pkt = new Uint8Array(4 + payload.length);
		u16le(pkt, 0, this.st.total);
		u16le(pkt, 2, idx);
		pkt.set(payload, 4);
		try { await this.char.writeValueWithoutResponse(pkt); } catch { /* retry in flow timeout */ }
	}

	private async sendWindow() {
		const epoch = ++this.st.sendEpoch;
		let sent = 0;
		const start = this.st.nextIdx;
		while (this.st.nextIdx < this.st.total && this.st.nextIdx < this.st.ackStart + this.st.windowSize) {
			if (epoch !== this.st.sendEpoch || !this.st.active) return;
			await this.sendFrame(this.st.nextIdx);
			this.st.nextIdx++;
			sent++;
			if (sent < this.st.windowSize) await this.delay(5);
		}
		if (sent > 0) this.log(`Sent ${sent} [${start}..${this.st.nextIdx - 1}]`);
		if (epoch === this.st.sendEpoch) this.startFlowTimeout();
	}

	private startFlowTimeout() {
		if (this.st.flowTimeout) clearTimeout(this.st.flowTimeout);
		this.st.flowTimeout = setTimeout(async () => {
			if (!this.st.active) return;
			this.log(`Flow timeout, resend from ${this.st.ackStart}`);
			this.st.nextIdx = this.st.ackStart;
			await this.sendWindow();
		}, 1000);
	}

	private startSessionTimeout() {
		if (this.st.sessionTimeout) clearTimeout(this.st.sessionTimeout);
		this.st.sessionTimeout = setTimeout(() => {
			if (!this.st.active) return;
			this.log('Session timeout');
			this.st.resolveComplete?.(false);
			this.resetStream();
		}, 10000);
	}

	private waitReady(timeout = 5000): Promise<{ windowSize: number; mtu: number }> {
		return new Promise((resolve, reject) => {
			this.st.resolveReady = resolve;
			setTimeout(() => { if (this.st.resolveReady) { this.st.resolveReady = null; reject(new Error('Ready timeout')); } }, timeout);
		});
	}

	private waitFlowCtl(timeout = 2000): Promise<number> {
		return new Promise((resolve, reject) => {
			this.st.calibrationResolve = resolve;
			setTimeout(() => { if (this.st.calibrationResolve) { this.st.calibrationResolve = null; reject(new Error('Cal timeout')); } }, timeout);
		});
	}

	private async calibrate(count = 5) {
		const n = Math.min(count, this.st.total);
		const rtts: number[] = [];
		for (let i = 0; i < n; i++) {
			const t0 = performance.now();
			await this.sendFrame(this.st.nextIdx);
			this.st.nextIdx++;
			try { await this.waitFlowCtl(2000); rtts.push(performance.now() - t0); } catch { /* skip */ }
		}
		if (rtts.length > 0) {
			rtts.sort((a, b) => a - b);
			const med = rtts[Math.floor(rtts.length / 2)];
			this.log(`Calibrated: RTT=${med.toFixed(0)}ms`);
		}
	}

	private handleNotify(value: DataView, _idx: number) {
		const d = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
		if (d.length >= 4 && d[0] === MSG_TYPE.READY) {
			const ws = d[1], mtu = d[2] | (d[3] << 8);
			this.log(`Ready: win=${ws} mtu=${mtu}`);
			this.st.windowSize = ws; this.st.mtu = mtu;
			this.st.resolveReady?.({ windowSize: ws, mtu });
			return;
		}
		if (d.length >= 5 && d[0] === MSG_TYPE.FLOW_CONTROL) {
			const ack = d[1] | (d[2] << 8), bm = d[3] | (d[4] << 8);
			this.onFlowControl(ack, bm);
			return;
		}
	}

	private onFlowControl(ack: number, bitmap: number) {
		if (!this.st.active) return;

		if (this.st.calibrationResolve && ack > this.st.ackStart) {
			const r = this.st.calibrationResolve;
			this.st.calibrationResolve = null;
			this.st.ackStart = ack;
			r(ack);
			return;
		}

		this.startSessionTimeout();

		if (bitmap === 0xFFFF || ack >= this.st.total) {
			if (this.st.flowTimeout) clearTimeout(this.st.flowTimeout);
			if (this.st.sessionTimeout) clearTimeout(this.st.sessionTimeout);
			this.st.ackStart = this.st.total;
			this.st.resolveComplete?.(true);
			return;
		}

		if (ack <= this.st.ackStart) return;
		this.st.ackStart = ack;
		const pct = Math.round((ack / this.st.total) * 100);
		this.onProgress?.(pct, `${ack}/${this.st.total} (${pct}%)`);
		this.sendWindow();
	}

	// ── Private: lifecycle helpers ────────────────────────────────────────

	private reset() { this.server = null; this.char = null; this.msgIdx = 0; this.resetStream(); }
	private resetStream() {
		if (this.st.flowTimeout) clearTimeout(this.st.flowTimeout);
		if (this.st.sessionTimeout) clearTimeout(this.st.sessionTimeout);
		this.st = freshStream();
	}
	private onDisconnect() { this.reset(); this.emit('disconnected'); this.log('Disconnected'); }
	private emit(s: BleStatus) { this.onStatusChange?.(s); }
	private log(msg: string, dir: '' | '⇑' | '⇓' = '') { this.onLog?.({ time: ts(), msg, direction: dir }); }
	private delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
}

