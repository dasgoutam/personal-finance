<script lang="ts">
	import { fmt } from '$lib/utils/format'

	export let netWorth: number
	export let prevNetWorth: number
	export let currency: string = 'EUR'

	$: pctChange = prevNetWorth !== 0 ? ((netWorth - prevNetWorth) / Math.abs(prevNetWorth)) * 100 : null
	$: positive = pctChange !== null && pctChange >= 0
</script>

<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3">
	<p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Net Worth</p>
	<p class="text-2xl font-bold {netWorth >= 0 ? 'text-gray-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}">
		{fmt(netWorth, currency)}
	</p>
	{#if pctChange !== null}
		<p class="text-xs mt-1 {positive ? 'text-emerald-500' : 'text-rose-500'}">
			{positive ? '+' : ''}{pctChange.toFixed(1)}% since last month
		</p>
	{/if}
</div>
