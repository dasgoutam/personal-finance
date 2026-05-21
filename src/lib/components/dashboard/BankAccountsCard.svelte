<script lang="ts">
	import { fmt } from '$lib/utils/format'

	export let accounts: { name: string; balance: number; currency: string }[]
</script>

<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3">
	<p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Checking Accounts</p>
	<div class="space-y-1.5">
		{#each accounts as acct}
			<div class="flex justify-between items-baseline gap-2">
				<span class="text-xs text-gray-600 dark:text-gray-400 truncate">{acct.name}</span>
				<span class="text-xs font-semibold tabular-nums flex-shrink-0
					{acct.balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}">
					{fmt(acct.balance, acct.currency)}
				</span>
			</div>
		{/each}
	</div>
</div>
