export interface ResourceEntry {
	name: string;
	group: string;
	size: number;
	hex: string;
	data: Uint8Array;
}

export interface ExampleEntry {
	name: string;
	file: string;
	type?: 'dsl' | 'sdk';
	modes?: string[];
}

export interface RuntimeConfig {
	timers: TimerConfig[];
}

export interface TimerConfig {
	id: number;
	intervalMs: number;
	enabled: boolean;
}

export interface DownloadBundle {
	bytecode: Uint8Array;
	resources: ResourceEntry[];
	config: RuntimeConfig;
}
