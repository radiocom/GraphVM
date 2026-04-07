<script lang="ts">
	import type { ResourceEntry } from '$lib/types';

	let {
		resources = [],
		extraChars = $bindable(''),
		dslChars = []
	}: {
		resources: ResourceEntry[];
		extraChars: string;
		dslChars: string[];
	} = $props();

	let expandedGroups = $state<Set<string>>(new Set());
	let copiedTarget = $state('');

	let groups = $derived([...new Set(resources.map((r) => r.group))].sort());

	let allChars = $derived(() => {
		const set = new Set([...dslChars]);
		for (const ch of extraChars) {
			if (ch.trim().length > 0) set.add(ch);
		}
		return [...set].sort();
	});

	function toggleGroup(group: string) {
		const next = new Set(expandedGroups);
		if (next.has(group)) next.delete(group);
		else next.add(group);
		expandedGroups = next;
	}

	async function copyHex(text: string, target: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedTarget = target;
			setTimeout(() => (copiedTarget = ''), 1500);
		} catch {}
	}
</script>

<div class="thin-scroll flex h-full flex-col overflow-y-auto rounded border border-slate-700 bg-slate-800 p-3" style="min-height:400px">
	<!-- Extra chars for runtime -->
	<div class="mb-3">
		<h3 class="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
			Extra Characters (runtime)
		</h3>
		<p class="mb-1 text-[10px] text-slate-500">
			Characters that may appear at runtime but are not in the DSL. These will be included in the font resource.
		</p>
		<textarea
			bind:value={extraChars}
			placeholder="0123456789:/-°C%"
			spellcheck="false"
			rows="2"
			class="w-full resize-none rounded border border-slate-600 bg-slate-900 p-2 font-mono text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
		></textarea>
		<div class="mt-1 flex flex-wrap gap-1">
			<span class="text-[10px] text-slate-500">Font chars ({allChars().length}):</span>
			{#each allChars() as ch}
				<span class="rounded bg-slate-700 px-1 font-mono text-[10px] text-slate-300">{ch}</span>
			{/each}
		</div>
	</div>

	<!-- Resource groups -->
	{#if resources.length === 0}
		<p class="text-sm italic text-slate-500">No resources yet. Write DSL and click Render to generate resources.</p>
	{:else}
		<h3 class="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
			Generated Resources
		</h3>
		{#each groups as group}
			<div class="mb-2">
				<button
					class="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:bg-slate-700"
					onclick={() => toggleGroup(group)}
				>
					<span class="text-[10px]">{expandedGroups.has(group) ? '▼' : '▶'}</span>
					{group}
					<span class="ml-auto rounded bg-slate-600 px-1.5 text-[10px] text-slate-300">
						{resources.filter((r) => r.group === group).length}
					</span>
				</button>

				{#if expandedGroups.has(group)}
					{#each resources.filter((r) => r.group === group) as res}
						<div class="ml-4 mt-1 rounded border border-slate-700 bg-slate-900 p-2">
							<div class="mb-1 flex items-center gap-2">
								<span class="font-mono text-xs text-cyan-400">{res.name}</span>
								<span class="text-[10px] text-slate-500">{res.size} bytes</span>
								<button
									class="ml-auto text-[10px] text-slate-400 transition-colors hover:text-slate-200"
									onclick={() => copyHex(res.hex, res.name)}
								>
									{copiedTarget === res.name ? '✓ Copied' : '📋 Copy hex'}
								</button>
							</div>
							<pre class="thin-scroll max-h-32 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-500">{res.hex}</pre>
						</div>
					{/each}
				{/if}
			</div>
		{/each}
	{/if}
</div>
