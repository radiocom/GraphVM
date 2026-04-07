import { writable, derived, get } from 'svelte/store';
import type { ResourceEntry, RuntimeConfig } from '$lib/types';

// ── IndexedDB persistence helpers ─────────────────────────────────────────

const IDB_NAME = 'gvm_settings';
const IDB_STORE = 'kv';

function openIdb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(IDB_NAME, 1);
		req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
	try {
		const db = await openIdb();
		return new Promise((resolve) => {
			const tx = db.transaction(IDB_STORE, 'readonly');
			const r = tx.objectStore(IDB_STORE).get(key);
			r.onsuccess = () => resolve(r.result as T);
			r.onerror = () => resolve(undefined);
		});
	} catch { return undefined; }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
	try {
		const db = await openIdb();
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).put(value, key);
	} catch { /* ignore */ }
}

/** Create a writable store that auto-persists to IndexedDB. */
function persistedStore<T>(key: string, initial: T) {
	const store = writable<T>(initial);
	let restored = false;

	// Restore on creation, then enable auto-save
	idbGet<T>(key).then((val) => {
		if (val !== undefined) store.set(val);
		restored = true;
	});

	// Auto-save on change (only after IDB restore)
	store.subscribe((val) => {
		if (restored) idbSet(key, val);
	});

	return store;
}

// ── Persisted settings ────────────────────────────────────────────────────

export const downloadFilename = persistedStore('downloadFilename', 'graphvm.gvmb');
export const bleSelectedDeviceId = persistedStore('bleSelectedDeviceId', '');
export const resIndex = persistedStore('resIndex', 1);
export const colorMode = persistedStore<'rgb' | 'bw' | 'bwr'>('colorMode', 'bwr');

// ── Existing stores ───────────────────────────────────────────────────────

export const dslText = writable('');
export const extraChars = writable('');
export const fontSize = writable(14);
export const fontFamily = writable('monospace');

export const runtimeConfig = writable<RuntimeConfig>({
	timers: []
});

export const bytecode = writable<Uint8Array>(new Uint8Array());
export const hexView = writable('');
export const resources = writable<ResourceEntry[]>([]);
export const errorMsg = writable('');
export const wasmReady = writable(false);

export const allCharsForFont = derived(
	[dslText, extraChars],
	([$dslText, $extraChars]) => {
		const chars = new Set<string>();
		for (const raw of $dslText.split('\n')) {
			const trimmed = raw.replace(/;.*$/, '').trim();
			if (!trimmed) continue;
			const parts = trimmed.split(/\s+/);
			const op = parts[0].toUpperCase();
			if (op === 'TEXT' && parts.length >= 4) {
				const content = parts.slice(3).join(' ').replace(/^"/, '').replace(/"$/, '');
				for (const ch of content) {
					if (ch.trim().length > 0) chars.add(ch);
				}
			}
		}
		for (const ch of $extraChars) {
			if (ch.trim().length > 0) chars.add(ch);
		}
		return [...chars].sort();
	}
);
