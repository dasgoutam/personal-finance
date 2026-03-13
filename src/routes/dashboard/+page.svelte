<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const CATEGORY_BADGE: Record<string, string> = {
		asset: 'bg-green-50 text-green-700',
		liability: 'bg-red-50 text-red-700',
		equity: 'bg-blue-50 text-blue-700',
		income: 'bg-emerald-50 text-emerald-700',
		expense: 'bg-orange-50 text-orange-700'
	};

	function formatAmount(amount: number, currency: string): string {
		return new Intl.NumberFormat('de-DE', {
			style: 'currency',
			currency,
			minimumFractionDigits: 2
		}).format(amount / 100);
	}

	function formatDate(dateStr: string): string {
		// Parse as local date to avoid UTC-offset issues with YYYY-MM-DD strings
		const [year, month, day] = dateStr.split('-').map(Number);
		return new Intl.DateTimeFormat('de-DE', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		}).format(new Date(year, month - 1, day));
	}

	// Group accounts by type name
	$: typeNames = [...new Set(data.accountBalances.map((a) => a.typeName))].sort();
	$: byType = Object.fromEntries(
		typeNames.map((t) => [t, data.accountBalances.filter((a) => a.typeName === t)])
	);
</script>

<svelte:head>
	<title>Dashboard — Personal Finance</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-8">Dashboard</h1>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
		<!-- ---------------------------------------------------------------- -->
		<!-- Account balances sidebar                                         -->
		<!-- ---------------------------------------------------------------- -->
		<div class="lg:col-span-1 space-y-4">
			<h2 class="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Accounts</h2>

			{#each typeNames as typeName}
				{#if byType[typeName]?.length}
					{@const category = byType[typeName][0].typeCategory}
					<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
						<div class="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
							<span
								class="text-xs font-semibold px-2 py-0.5 rounded-full {CATEGORY_BADGE[category] ?? ''}"
							>
								{typeName}
							</span>
						</div>
						<ul class="divide-y divide-gray-50 dark:divide-gray-700">
							{#each byType[typeName] as account}
								<li class="px-4 py-2.5 flex items-center justify-between text-sm gap-2">
									<span class="text-gray-700 dark:text-gray-200 truncate font-medium">
										{account.name}
									</span>
									<span
										class="font-mono tabular-nums shrink-0 text-xs {account.balance < 0
											? 'text-red-600'
											: 'text-gray-900 dark:text-white'}"
									>
										{formatAmount(account.balance, account.currency)}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
		</div>

		<!-- ---------------------------------------------------------------- -->
		<!-- Recent transactions                                               -->
		<!-- ---------------------------------------------------------------- -->
		<div class="lg:col-span-2">
			<h2 class="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
				Recent Transactions
			</h2>

			{#if data.recentTransactions.length === 0}
				<div
					class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-gray-400 dark:text-gray-500 text-sm"
				>
					<p class="font-medium text-gray-600 dark:text-gray-300 mb-1">No transactions yet</p>
					<p>Run <code class="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">npm run db:seed</code> to load sample data.</p>
				</div>
			{:else}
				<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-left">
								<th class="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide w-32"
									>Date</th
								>
								<th class="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide"
									>Description</th
								>
								<th
									class="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide text-right w-16"
									>Legs</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-50 dark:divide-gray-700">
							{#each data.recentTransactions as tx}
								<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
									<td class="px-4 py-3 text-gray-400 dark:text-gray-500 font-mono text-xs whitespace-nowrap">
										{formatDate(tx.date)}
									</td>
									<td class="px-4 py-3 text-gray-900 dark:text-white">
										<div>{tx.description}</div>
										{#if tx.notes}
											<div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-sm">{tx.notes}</div>
										{/if}
									</td>
									<td class="px-4 py-3 text-right text-gray-400 dark:text-gray-500 text-xs tabular-nums">
										{tx.entryCount}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</div>
