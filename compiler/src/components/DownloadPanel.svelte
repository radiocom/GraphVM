<script lang="ts">
	let {
		bytecodeLen = 0,
		downloadFilename = $bindable('graphvm.gvmb'),
		outputDirName = '',
		ondownload,
		onchangeDir
	}: {
		bytecodeLen: number;
		downloadFilename: string;
		outputDirName: string;
		ondownload: () => void;
		onchangeDir: () => void;
	} = $props();
</script>

<div class="flex items-center gap-1.5">
	<input
		type="text"
		bind:value={downloadFilename}
		placeholder="graphvm.gvmb"
		class="w-36 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-200 placeholder:text-slate-500"
	/>
	<button
		onclick={ondownload}
		disabled={bytecodeLen === 0}
		class="rounded bg-emerald-600 px-4 py-1 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
	>
		⬇ Download
	</button>
	{#if outputDirName}
		<span
			class="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400"
			title="Output directory"
		>
			📁 {outputDirName}
		</span>
		<button
			onclick={onchangeDir}
			class="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-600 hover:text-slate-200"
			title="Change output directory"
		>
			✕
		</button>
	{/if}
</div>
