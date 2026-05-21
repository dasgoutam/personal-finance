<script lang="ts">
	import { goto } from '$app/navigation'
	import { page } from '$app/stores'

	export let data

	const MONTHS = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	]

	const currentYear = new Date().getFullYear()
	const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

	const BAR_COLORS = [
		{ bar: 'bg-slate-500' },
		{ bar: 'bg-sky-500' },
		{ bar: 'bg-emerald-500' },
		{ bar: 'bg-amber-500' },
		{ bar: 'bg-rose-500' },
		{ bar: 'bg-teal-500' },
		{ bar: 'bg-orange-500' },
		{ bar: 'bg-pink-500' },
		{ bar: 'bg-indigo-500' },
		{ bar: 'bg-cyan-500' },
		{ bar: 'bg-lime-500' },
		{ bar: 'bg-fuchsia-500' },
	]

	$: currentMonthIndex = parseInt(data.month, 10) - 1  // 0-based

	function stepMonth(delta: number) {
		let m = currentMonthIndex + delta
		let y = parseInt(data.year)
		if (m < 0)  { m = 11; y-- }
		if (m > 11) { m = 0;  y++ }
		const params = new URLSearchParams($page.url.searchParams)
		params.set('month', String(m + 1).padStart(2, '0'))
		params.set('year', String(y))
		goto(`?${params.toString()}`)
	}

	function setMode(mode: string) {
		const params = new URLSearchParams($page.url.searchParams)
		params.set('mode', mode)
		goto(`?${params.toString()}`)
	}

	function onYearChange(e: Event) {
		const params = new URLSearchParams($page.url.searchParams)
		params.set('year', (e.target as HTMLSelectElement).value)
		goto(`?${params.toString()}`)
	}

	function fmt(amount: number, currency: string) {
		return new Intl.NumberFormat('de-DE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount / 100)
	}

	$: bankAccounts = data.accountBalances.filter(a => a.typeName === 'Bank')
	$: investmentAccounts = data.accountBalances.filter(a => a.commoditySymbol != null)

	function fmtUnits(units: number, symbol: string) {
		const qty = units / 1_000_000;
		return `${qty.toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 6 })} ${symbol}`;
	}
	$: netWorth = data.accountBalances.reduce((sum, a) => {
		if (a.typeCategory === 'asset')     return sum + a.balance
		if (a.typeCategory === 'liability') return sum - a.balance
		return sum
	}, 0)

	$: grandTotal = data.expenseGrouping.reduce((sum, e) => sum + e.total, 0)
	$: rows = data.expenseGrouping.map((e, i) => ({
		category: e.category,
		total: e.total / 100,
		percentage: grandTotal > 0 ? (e.total / grandTotal) * 100 : 0,
		color: BAR_COLORS[i % BAR_COLORS.length]
	}))
</script>

<svelte:head>
	<title>Dashboard — Personal Finance</title>
</svelte:head>

<div class="p-4 max-w-2xl space-y-4">

	<!-- ── Top row: Net Worth + Bank Accounts ───────────────────────────── -->
	<div class="grid grid-cols-2 gap-4">

		<!-- Net Worth -->
		<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3">
			<p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Net Worth</p>
			<p class="text-2xl font-bold {netWorth >= 0 ? 'text-gray-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}">
				{fmt(netWorth, 'EUR')}
			</p>
		</div>

		<!-- Bank Accounts -->
		<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3">
			<p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Checking Accounts</p>
			<div class="space-y-1.5">
				{#each bankAccounts as acct}
					<div class="flex justify-between items-baseline gap-2">
						<span class="text-xs text-gray-600 dark:text-gray-400 truncate">{acct.name}</span>
						<span class="text-xs font-semibold tabular-nums text-gray-900 dark:text-white flex-shrink-0
							{acct.balance < 0 ? 'text-rose-600 dark:text-rose-400' : ''}">
							{fmt(acct.balance, acct.currency)}
						</span>
					</div>
				{/each}
			</div>
		</div>

	</div>

	<!-- ── Investment Holdings ───────────────────────────────────────────── -->
	{#if investmentAccounts.length > 0}
		<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3">
			<p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Holdings</p>
			<div class="space-y-1.5">
				{#each investmentAccounts as acct}
					<div class="flex justify-between items-baseline gap-2">
						<span class="text-xs text-gray-600 dark:text-gray-400 truncate">{acct.name}</span>
						<span class="text-xs font-semibold tabular-nums text-gray-900 dark:text-white flex-shrink-0">
							{fmtUnits(acct.units, acct.commoditySymbol ?? '')}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

		<!-- Header -->
		<div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">

			<!-- Left: title + period navigator -->
			<div class="flex items-center gap-2 min-w-0">
				<h2 class="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">Expenses</h2>

				{#if data.mode === 'month'}
					<div class="flex items-center gap-1">
						<button on:click={() => stepMonth(-1)}
							class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
							</svg>
						</button>
						<span class="text-xs font-medium text-gray-700 dark:text-gray-300 w-28 text-center">
							{MONTHS[currentMonthIndex]} {data.year}
						</span>
						<button on:click={() => stepMonth(1)}
							class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
							</svg>
						</button>
					</div>
				{:else}
					<select
						class="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
						value={data.year}
						on:change={onYearChange}
					>
						{#each years as year}
							<option value={year}>{year}</option>
						{/each}
					</select>
				{/if}
			</div>

			<!-- Right: mode toggle -->
			<div class="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium flex-shrink-0">
				<button
					class="px-2.5 py-1 transition-colors
						{data.mode === 'month'
							? 'bg-indigo-600 text-white'
							: 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}"
					on:click={() => setMode('month')}
				>Month</button>
				<button
					class="px-2.5 py-1 transition-colors border-l border-gray-200 dark:border-gray-700
						{data.mode === 'year'
							? 'bg-indigo-600 text-white'
							: 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}"
					on:click={() => setMode('year')}
				>Year</button>
			</div>

		</div>

		<!-- Body -->
		{#if rows.length === 0}
			<div class="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-xs">
				No expense data for this period.
			</div>
		{:else}
			<!-- Total + stacked bar -->
			<div class="px-4 pt-3 pb-2">
				<div class="flex items-baseline gap-1.5 mb-2">
					<span class="text-xl font-bold text-gray-900 dark:text-white">€{(grandTotal / 100).toFixed(2)}</span>
					<span class="text-xs text-gray-400 dark:text-gray-500">{rows.length} {rows.length === 1 ? 'category' : 'categories'}</span>
				</div>
				<div class="flex h-2 overflow-hidden bg-gray-100 dark:bg-gray-700 gap-px">
					{#each rows as row}
						<div
							class="{row.color.bar} transition-all duration-500"
							style="width: {row.percentage}%"
							title="{row.category}: {row.percentage.toFixed(1)}%"
						/>
					{/each}
				</div>
			</div>

			<!-- Rows -->
			<div class="divide-y divide-gray-50 dark:divide-gray-700/50 pb-1">
				{#each rows as row}
					<div class="px-4 py-2 grid items-center gap-3" style="grid-template-columns: 0.75rem 8rem 1fr 3rem 5rem">
						<span class="w-2 h-2 rounded-full {row.color.bar}"></span>
						<span class="text-xs text-gray-700 dark:text-gray-300 truncate">{row.category}</span>
						<div class="bg-gray-100 dark:bg-gray-700 h-2">
							<div class="{row.color.bar} h-2 transition-all duration-500" style="width: {row.percentage}%" />
						</div>
						<span class="text-xs tabular-nums text-gray-400 dark:text-gray-500 text-right">{row.percentage.toFixed(1)}%</span>
						<span class="text-xs font-semibold tabular-nums text-gray-900 dark:text-white text-right">€{row.total.toFixed(2)}</span>
					</div>
				{/each}
			</div>

			<!-- Footer -->
			<div class="px-4 py-2 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex justify-between">
				<span class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Total</span>
				<span class="text-xs font-bold text-gray-900 dark:text-white">€{(grandTotal / 100).toFixed(2)}</span>
			</div>
		{/if}

	</div>

</div>
