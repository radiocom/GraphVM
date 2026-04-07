<script lang="ts">
	import type { ExampleEntry } from '$lib/types';
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { EditorState } from '@codemirror/state';
	import { javascript } from '@codemirror/lang-javascript';
	import dslLanguage from '$lib/compiler/dsl-lang';

	let {
		text = '',
		ontext,
		selectedExample = '',
		examples = [],
		onloadExample,
		mode = 'dsl'
	}: {
		text: string;
		ontext: (value: string) => void;
		selectedExample: string;
		examples: ExampleEntry[];
		onloadExample: (file: string) => void;
		mode?: 'dsl' | 'sdk';
	} = $props();

	let editorContainer: HTMLDivElement;
	let view: EditorView | undefined;

	onMount(() => {
		const extensions = [
			basicSetup,
			mode === 'sdk' ? javascript({ typescript: true }) : dslLanguage,
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					ontext(update.state.doc.toString());
				}
			}),
			EditorView.theme({
				'&': {
					height: '100%',
					fontSize: '14px',
					backgroundColor: '#1e293b',
					color: mode === 'sdk' ? '#fde68a' : '#e2e8f0'
				},
				'.cm-content': {
					fontFamily: 'ui-monospace, monospace',
					caretColor: '#06b6d4'
				},
				'.cm-gutters': {
					backgroundColor: '#0f172a',
					color: '#64748b',
					border: 'none'
				},
				'.cm-activeLineGutter': {
					backgroundColor: '#1e293b'
				},
				'.cm-activeLine': {
					backgroundColor: '#1e293b'
				},
				'&.cm-focused .cm-cursor': {
					borderLeftColor: '#06b6d4'
				},
				'&.cm-focused .cm-selectionBackground, ::selection': {
					backgroundColor: '#334155'
				},
				'.cm-selectionBackground': {
					backgroundColor: '#334155'
				}
			}),
			EditorView.theme(
				mode === 'sdk'
					? {
							'.cm-string': { color: '#86efac' },
							'.cm-number': { color: '#fbbf24' },
							'.cm-keyword': { color: '#c084fc' },
							'.cm-variableName': { color: '#fde68a' },
							'.cm-propertyName': { color: '#60a5fa' },
							'.cm-comment': { color: '#64748b', fontStyle: 'italic' },
							'.cm-operator': { color: '#f472b6' },
							'.cm-punctuation': { color: '#94a3b8' }
						}
					: {
							'.cm-string': { color: '#86efac' },
							'.cm-number': { color: '#fbbf24' },
							'.cm-keyword': { color: '#c084fc' },
							'.cm-comment': { color: '#64748b', fontStyle: 'italic' }
						}
			)
		];

		view = new EditorView({
			state: EditorState.create({
				doc: text,
				extensions
			}),
			parent: editorContainer
		});

		return () => {
			view?.destroy();
		};
	});

	$effect(() => {
		if (view && text !== view.state.doc.toString()) {
			view.dispatch({
				changes: {
					from: 0,
					to: view.state.doc.length,
					insert: text
				}
			});
		}
	});
</script>

<div class="flex h-full flex-col">
	<div class="mb-1 flex items-center gap-2">
		<h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500">
			{mode === 'sdk' ? 'SDK Editor' : 'DSL Editor'}
		</h2>
		{#if examples.length > 0}
			<select
				value={selectedExample}
				onchange={(e) => onloadExample(e.currentTarget.value)}
				class="ml-auto rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
			>
				{#each examples as ex}
					<option value={ex.file}>{ex.name}</option>
				{/each}
			</select>
		{/if}
	</div>
	<div
		bind:this={editorContainer}
		class="thin-scroll flex-1 overflow-auto rounded border border-slate-700"
		style="min-height:400px"
	></div>
	{#if mode === 'sdk'}
		<p class="mt-1 text-[10px] text-slate-500">
			SDK code runs via <code class="text-slate-400">new Function()</code>. Available: <code
				class="text-slate-400">gvm()</code
			>, <code class="text-slate-400">rgb()</code>, <code class="text-slate-400">GvmProgram</code
			>. Must <code class="text-slate-400">return</code> a GvmProgram.
		</p>
	{/if}
</div>
