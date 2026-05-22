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

	type SortKey = 'name' | 'typeName' | 'marketValue' | 'costBasis' | 'pnl' | 'xirr'
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

	function allocationPct(row: InvestmentRow): number {
		if (totalMarketValue <= 0) return 0
		return (row.marketValue ?? row.costBasis) / totalMarketValue
	}

	function fmtPct(v: number | null): string {
		if (v === null) return '—'
		return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'
	}

	function pnlPct(costBasis: number, pnl: number | null): string {
		if (pnl === null || costBasis <= 0) return ''
		return (pnl >= 0 ? '+' : '') + ((pnl / costBasis) * 100).toFixed(1) + '%'
	}

	const TYPE_COLOR: Record<string, string> = {
		ETF:    'bg-indigo-400 dark:bg-indigo-500',
		Stocks: 'bg-sky-400 dark:bg-sky-500',
		Crypto: 'bg-amber-400 dark:bg-amber-500',
	}

	const TYPE_PILLS: Record<string, string> = {
		ETF:    'text-indigo-600 dark:text-indigo-400',
		Stocks: 'text-sky-600 dark:text-sky-400',
		Crypto: 'text-amber-600 dark:text-amber-400',
	}

	const COLUMNS: { key: SortKey; label: string; right?: boolean }[] = [
		{ key: 'name',        label: 'Account'    },
		{ key: 'typeName',    label: 'Type'       },
		{ key: 'costBasis',   label: 'Cost',      right: true },
		{ key: 'marketValue', label: 'Value',     right: true },
		{ key: 'pnl',         label: 'P&L',       right: true },
		{ key: 'xirr',        label: 'XIRR',      right: true },
	]
</script>

<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

	<div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
		<h2 class="text-sm font-semibold text-gray-900 dark:text-white">Investments</h2>
		<div class="flex items-center gap-3">
			{#if totalXirr !== null}
				<span class="text-[11px] font-medium {totalXirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}">
					XIRR {fmtPct(totalXirr)}
				</span>
			{/if}
			<span class="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{fmt(totalMarketValue, 'EUR')}</span>
		</div>
	</div>

	{#if rows.length === 0}
		<div class="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-xs">No investment accounts found.</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead>
					<tr class="border-b border-gray-100 dark:border-gray-700">
						<!-- allocation bar column -->
						<th class="w-1"></th>
						{#each COLUMNS as col}
							<th
								class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 whitespace-nowrap cursor-pointer select-none hover:text-gray-600 dark:hover:text-gray-300 transition-colors {col.right ? 'text-right' : 'text-left'}"
								on:click={() => setSort(col.key)}
							>
								{col.label}{#if sortKey === col.key}<span class="ml-0.5 opacity-50">{sortDir === -1 ? '↓' : '↑'}</span>{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each sorted as row}
						{@const pct = allocationPct(row)}
						{@const pp  = pnlPct(row.costBasis, row.pnl)}
						{@const barColor = TYPE_COLOR[row.typeName] ?? 'bg-gray-300 dark:bg-gray-500'}
						<tr class="group border-b border-gray-50 dark:border-gray-700/40 hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors">
							<!-- allocation bar -->
							<td class="w-1 p-0 relative">
								<div class="absolute inset-y-0 left-0 w-1 {barColor} opacity-0 group-hover:opacity-100 transition-opacity"></div>
								<div class="w-1 h-full {barColor}" style="opacity: {Math.max(0.15, pct * 1.2)}"></div>
							</td>
							<!-- name -->
							<td class="pl-2 pr-3 py-2 text-xs font-medium text-gray-800 dark:text-gray-200 max-w-[130px]">
								<span class="truncate block">{row.name}</span>
							</td>
							<!-- type -->
							<td class="px-3 py-2 text-[10px] font-semibold {TYPE_PILLS[row.typeName] ?? 'text-gray-400'}">
								{row.typeName}
							</td>
							<!-- cost basis -->
							<td class="px-3 py-2 text-right text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
								{fmt(row.costBasis, row.currency)}
							</td>
							<!-- market value -->
							<td class="px-3 py-2 text-right text-xs font-semibold tabular-nums text-gray-900 dark:text-white">
								{row.marketValue !== null ? fmt(row.marketValue, row.currency) : fmt(row.costBasis, row.currency)}
							</td>
							<!-- P&L -->
							<td class="px-3 py-2 text-right text-xs tabular-nums">
								{#if row.pnl !== null}
									<span class="font-medium {row.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}">
										{row.pnl >= 0 ? '+' : ''}{fmt(row.pnl, row.currency)}
									</span>
									{#if pp}
										<span class="ml-1 text-[10px] {row.pnl >= 0 ? 'text-emerald-500/70 dark:text-emerald-500' : 'text-rose-400/70 dark:text-rose-500'}">{pp}</span>
									{/if}
								{:else}
									<span class="text-gray-300 dark:text-gray-600">—</span>
								{/if}
							</td>
							<!-- XIRR -->
							<td class="px-3 py-2 text-right text-xs tabular-nums font-medium
								{row.xirr === null ? 'text-gray-300 dark:text-gray-600' : row.xirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}">
								{fmtPct(row.xirr)}
							</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr class="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/30">
						<td class="w-1"></td>
						<td class="pl-2 pr-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500" colspan="2">Total</td>
						<td class="px-3 py-2 text-right text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
							{fmt(totalCostBasis, 'EUR')}
						</td>
						<td class="px-3 py-2 text-right text-xs font-semibold tabular-nums text-gray-900 dark:text-white">
							{fmt(totalMarketValue, 'EUR')}
						</td>
						<td class="px-3 py-2 text-right text-xs tabular-nums">
							{#if hasPnl}
								<span class="font-medium {totalPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}">
									{totalPnl >= 0 ? '+' : ''}{fmt(totalPnl, 'EUR')}
								</span>
								{#if totalCostBasis > 0}
									{@const totalPnlPct = (totalPnl / totalCostBasis) * 100}
									<span class="ml-1 text-[10px] {totalPnl >= 0 ? 'text-emerald-500/70 dark:text-emerald-500' : 'text-rose-400/70 dark:text-rose-500'}">
										{totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(1)}%
									</span>
								{/if}
							{:else}
								<span class="text-gray-300 dark:text-gray-600">—</span>
							{/if}
						</td>
						<td class="px-3 py-2 text-right text-xs tabular-nums font-medium
							{totalXirr === null ? 'text-gray-300 dark:text-gray-600' : totalXirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}">
							{fmtPct(totalXirr)}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	{/if}

</div>
