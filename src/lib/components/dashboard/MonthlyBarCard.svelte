<script lang="ts">
	import { fmt } from '$lib/utils/format'

	export let title: string
	export let months: { label: string; total: number }[]
	export let currency: string = 'EUR'

	$: avg = months.length > 0 ? months.reduce((s, m) => s + m.total, 0) / months.length : 0
</script>

<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3">
	<p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">{title}</p>
	<p class="text-2xl font-bold text-gray-900 dark:text-white">{fmt(avg, currency)}</p>
	<p class="text-xs text-gray-400 dark:text-gray-500 mt-1">3-month average</p>
</div>
