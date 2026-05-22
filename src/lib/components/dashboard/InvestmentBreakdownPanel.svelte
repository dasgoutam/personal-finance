<script lang="ts">
	import { fmt } from '$lib/utils/format'

	type InvestmentRow = {
		id: number
		name: string
		currency: string
		typeName: string
		costBasis: number
		marketValue: number | null
		pnl: number | null
		xirr: number | null
	}

	export let rows: InvestmentRow[]
	export let totalXirr: number | null

	type SortKey = 'name' | 'typeName' | 'marketValue' | 'pnl' | 'xirr'
	let sortKey: SortKey = 'marketValue'
	let sortDir: 1 | -1 = -1

	function setSort(key: SortKey) {
		if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1
		else { sortKey = key; sortDir = -1 }
	}

	$: sorted = [...rows].sort((a, b) => {
		const av = a[sortKey] ?? -Infinity
		const bv = b[sortKey] ?? -Infinity
		if (av < bv) return sortDir
		if (av > bv) return -sortDir
		return 0
	})

	$: totalMarketValue = rows.reduce((s, r) => s + (r.marketValue ?? r.costBasis), 0)
	$: totalCostBasis   = rows.reduce((s, r) => s + r.costBasis, 0)
	$: totalPnl         = rows.reduce((s, r) => r.pnl !== null ? s + r.pnl : s, 0)
	$: hasPnl           = rows.some(r => r.pnl !== null)

	function fmtPct(v: number | null): string {
		if (v === null) return '—'
		return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'
	}

	function pnlPct(costBasis: number, pnl: number | null): string | null {
		if (pnl === null || costBasis <= 0) return null
		return (pnl >= 0 ? '+' : '') + ((pnl / costBasis) * 100).toFixed(1) + '%'
	}

	const TYPE_PILLS: Record<string, string> = {
		ETF:    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
		Stocks: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
		Crypto: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
	}

	const COLUMNS: { key: SortKey; label: string }[] = [
		{ key: 'name',        label: 'Account' },
		{ key: 'typeName',    label: 'Type'    },
		{ key: 'marketValue', label: 'Value'   },
		{ key: 'pnl',         label: 'P&L'     },
		{ key: 'xirr',        label: 'XIRR'    },
	]
</script>

<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

	<div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
		<h2 class="text-sm font-semibold text-gray-900 dark:text-white">Investment Breakdown</h2>
		<span class="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{fmt(totalMarketValue, 'EUR')}</span>
	</div>

	{#if rows.length === 0}
		<div class="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-xs">No investment accounts found.</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead>
					<tr class="border-b border-gray-100 dark:border-gray-700">
						{#each COLUMNS as col}
							<th
								class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 whitespace-nowrap cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300 transition-colors
									{col.key === 'name' || col.key === 'typeName' ? 'text-left' : 'text-right'}"
								on:click={() => setSort(col.key)}
							>
								{col.label}{#if sortKey === col.key}<span class="ml-0.5 opacity-60">{sortDir === -1 ? '↓' : '↑'}</span>{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-50 dark:divide-gray-700/40">
					{#each sorted as row}
						{@const pp = pnlPct(row.costBasis, row.pnl)}
						<tr class="hover:bg-gray-50/70 dark:hover:bg-gray-700/20 transition-colors">
							<td class="px-3 py-2 text-xs font-medium text-gray-800 dark:text-gray-200 max-w-[140px]">
								<span class="truncate block">{row.name}</span>
							</td>
							<td class="px-3 py-2">
								<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold
									{TYPE_PILLS[row.typeName] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}">
									{row.typeName}
								</span>
							</td>
							<td class="px-3 py-2 text-right text-xs font-semibold tabular-nums text-gray-900 dark:text-white">
								{row.marketValue !== null ? fmt(row.marketValue, row.currency) : fmt(row.costBasis, row.currency)}
							</td>
							<td class="px-3 py-2 text-right text-xs tabular-nums leading-tight">
								{#if row.pnl !== null}
									<span class="font-semibold {row.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
										{row.pnl >= 0 ? '+' : ''}{fmt(row.pnl, row.currency)}
									</span>
									{#if pp}
										<span class="block text-[10px] {row.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}">{pp}</span>
									{/if}
								{:else}
									<span class="text-gray-300 dark:text-gray-600">—</span>
								{/if}
							</td>
							<td class="px-3 py-2 text-right text-xs tabular-nums font-medium
								{row.xirr === null ? 'text-gray-300 dark:text-gray-600' : row.xirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
								{fmtPct(row.xirr)}
							</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr class="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40">
						<td class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500" colspan="2">Total</td>
						<td class="px-3 py-2 text-right text-xs font-semibold tabular-nums text-gray-900 dark:text-white">{fmt(totalMarketValue, 'EUR')}</td>
						<td class="px-3 py-2 text-right text-xs tabular-nums leading-tight">
							{#if hasPnl}
								<span class="font-semibold {totalPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
									{totalPnl >= 0 ? '+' : ''}{fmt(totalPnl, 'EUR')}
								</span>
								{#if totalCostBasis > 0}
									<span class="block text-[10px] {totalPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}">
										{((totalPnl / totalCostBasis) * 100 >= 0 ? '+' : '')}{((totalPnl / totalCostBasis) * 100).toFixed(1)}%
									</span>
								{/if}
							{:else}
								<span class="text-gray-300 dark:text-gray-600">—</span>
							{/if}
						</td>
						<td class="px-3 py-2 text-right text-xs tabular-nums font-medium
							{totalXirr === null ? 'text-gray-300 dark:text-gray-600' : totalXirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
							{fmtPct(totalXirr)}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	{/if}

</div>
