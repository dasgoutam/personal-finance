<script lang="ts">
	import { fmt } from '$lib/utils/format'

	export let rows: { balance: number; currency: string }[]
	export let prevRows: { balance: number; currency: string }[]

	$: primaryRow = rows[0] ?? null
	$: prevPrimary = prevRows[0] ?? null
	$: diff = primaryRow && prevPrimary ? primaryRow.balance - prevPrimary.balance : null
	$: positive = diff !== null && diff >= 0
</script>

<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3">
	<p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Total Invested</p>
	{#if !primaryRow}
		<p class="text-2xl font-bold text-gray-900 dark:text-white">—</p>
	{:else}
		<p class="text-2xl font-bold text-gray-900 dark:text-white">{fmt(primaryRow.balance, primaryRow.currency)}</p>
		{#if diff !== null}
			<p class="text-xs mt-1 {positive ? 'text-emerald-500' : 'text-rose-500'}">
				{positive ? '+' : ''}{fmt(diff, primaryRow.currency)} since last month
			</p>
		{/if}
	{/if}
</div>
