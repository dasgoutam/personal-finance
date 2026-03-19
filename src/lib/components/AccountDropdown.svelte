<script lang="ts">
	import { tick } from 'svelte';

	export let value: string;
	export let formId: string;
	export let name: string;
	export let placeholder = 'Account…';
	export let disabledId: string = '';
	export let borderClass = 'border-blue-300';
	export let ringClass   = 'focus:ring-blue-500';

	export let grouped: {
		label: string;
		category: string;
		accounts: { id: number; name: string; currency: string }[];
	}[];

	const CATEGORY_COLORS: Record<string, string> = {
		asset:     'bg-blue-50 text-blue-700',
		liability: 'bg-red-50 text-red-700',
		equity:    'bg-purple-50 text-purple-700',
		income:    'bg-green-50 text-green-700',
		expense:   'bg-orange-50 text-orange-700'
	};

	let open = false;
	let search = '';
	let buttonEl: HTMLButtonElement;
	let dropdownStyle = '';
	let searchEl: HTMLInputElement;

	$: selected = grouped.flatMap((g) => g.accounts).find((a) => String(a.id) === value);
	$: selectedCategory = grouped.find((g) => g.accounts.some((a) => String(a.id) === value))?.category ?? '';

	$: filtered = grouped
		.map((g) => ({
			...g,
			accounts: g.accounts.filter((a) =>
				!search || a.name.toLowerCase().includes(search.toLowerCase())
			)
		}))
		.filter((g) => g.accounts.length > 0);

	async function openDropdown() {
		open = true;
		search = '';
		// Position using fixed coords from button rect
		await tick();
		const rect = buttonEl.getBoundingClientRect();
		const spaceBelow = window.innerHeight - rect.bottom;
		if (spaceBelow < 220 && rect.top > 220) {
			// Open upward
			dropdownStyle = `position:fixed;bottom:${window.innerHeight - rect.top}px;left:${rect.left}px;min-width:${rect.width}px;`;
		} else {
			dropdownStyle = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;min-width:${rect.width}px;`;
		}
		await tick();
		searchEl?.focus();
	}

	function pick(id: number) {
		value = String(id);
		open = false;
	}
</script>

<div class="relative w-full">
	<input type="hidden" {name} form={formId} {value} />

	<button
		bind:this={buttonEl}
		type="button"
		on:click={openDropdown}
		class="w-full rounded-lg border {borderClass} bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs text-left
		       flex items-center justify-between gap-1 focus:outline-none focus:ring-2 {ringClass}"
	>
		{#if selected}
			<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium truncate
			             {CATEGORY_COLORS[selectedCategory] ?? 'bg-gray-100 text-gray-600'}">
				{selected.name}
				<span class="ml-1 opacity-60">{selected.currency}</span>
			</span>
		{:else}
			<span class="text-gray-400 dark:text-gray-500">{placeholder}</span>
		{/if}
		<svg class="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if open}
		<!-- Fixed-position dropdown panel — never clipped by overflow -->
		<div
			style={dropdownStyle}
			class="z-50 w-max max-w-xs rounded-xl border border-gray-200 dark:border-gray-700
			       bg-white dark:bg-gray-800 shadow-xl py-1"
		>
			<!-- Search -->
			<div class="px-2 pb-1 pt-1.5">
				<input
					bind:this={searchEl}
					bind:value={search}
					type="text"
					placeholder="Search…"
					class="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700
					       dark:text-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
				/>
			</div>

			{#if filtered.length === 0}
				<p class="px-3 py-3 text-xs text-gray-400 dark:text-gray-500 italic">No accounts match</p>
			{:else}
				{#each filtered as group}
					<div class="px-2 pt-1.5 pb-0.5">
						<span class="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
							{group.label}
						</span>
					</div>
					{#each group.accounts as acct}
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div
							on:click={() => { if (String(acct.id) !== disabledId) pick(acct.id); }}
							class="mx-1 px-2 py-1.5 rounded-lg flex items-center justify-between gap-3
							       {String(acct.id) === disabledId
							           ? 'opacity-30 cursor-not-allowed'
							           : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700'}"
						>
							<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium
							             {CATEGORY_COLORS[group.category] ?? 'bg-gray-100 text-gray-600'}">
								{acct.name}
							</span>
							<span class="text-[10px] text-gray-400 dark:text-gray-500 font-mono shrink-0">{acct.currency}</span>
						</div>
					{/each}
				{/each}
			{/if}
		</div>

		<!-- Click-outside overlay -->
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="fixed inset-0 z-40" on:click={() => (open = false)}></div>
	{/if}
</div>
