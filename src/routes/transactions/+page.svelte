<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import AccountDropdown from '$lib/components/AccountDropdown.svelte';

	export let data: PageData;
	export let form: ActionData;

	// ── Constants ────────────────────────────────────────────────────────────

	const CURRENCIES = ['EUR', 'INR', 'USD', 'GBP', 'CHF'];
	const SYMBOLS: Record<string, string> = { EUR: '€', INR: '₹', USD: '$', GBP: '£', CHF: 'Fr' };

	import { page } from '$app/stores';

	let showStarredOnly = false;
	$: txList = showStarredOnly ? data.txList.filter((tx) => tx.isStarred) : data.txList;

	// Group accounts by their type name, including category for colours
	$: grouped = [...new Set(data.accounts.map((a) => a.typeName))]
		.sort()
		.map((typeName) => {
			const accts = data.accounts.filter((a) => a.typeName === typeName);
			return { label: typeName, category: accts[0]?.typeCategory ?? 'asset', accounts: accts };
		})
		.filter((g) => g.accounts.length > 0);

	// Sidebar: group by category → type → accounts
	const CATEGORY_ORDER = ['asset', 'liability', 'income', 'expense', 'equity'];
	const CATEGORY_LABEL: Record<string, string> = {
		asset: 'Assets', liability: 'Liabilities', income: 'Income', expense: 'Expenses', equity: 'Equity'
	};
	const CATEGORY_COLORS: Record<string, { section: string; heading: string; link: string; active: string }> = {
		asset:     { section: 'bg-sky-50/60 dark:bg-sky-900/10',         heading: 'text-blue-600 dark:text-sky-400',        link: 'text-blue-700 dark:text-sky-300',        active: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' },
		liability: { section: 'bg-rose-50/60 dark:bg-rose-900/10',       heading: 'text-rose-600 dark:text-rose-400',       link: 'text-rose-700 dark:text-rose-300',       active: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' },
		income:    { section: 'bg-emerald-50/60 dark:bg-emerald-900/10', heading: 'text-emerald-600 dark:text-emerald-400', link: 'text-emerald-700 dark:text-emerald-300', active: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
		expense:   { section: 'bg-amber-50/60 dark:bg-amber-900/10',     heading: 'text-amber-600 dark:text-amber-400',     link: 'text-amber-700 dark:text-amber-300',     active: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
		equity:    { section: 'bg-violet-50/60 dark:bg-violet-900/10',   heading: 'text-violet-600 dark:text-violet-400',   link: 'text-violet-700 dark:text-violet-300',   active: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300' },
	};

	$: sidebarCategories = CATEGORY_ORDER
		.map(cat => ({
			category: cat,
			label: CATEGORY_LABEL[cat],
			types: [...new Set(data.accounts.filter(a => a.typeCategory === cat).map(a => a.typeName))]
				.sort()
				.map(typeName => ({
					typeName,
					accounts: data.accounts.filter(a => a.typeName === typeName)
				}))
				.filter(t => t.accounts.length > 0)
		}))
		.filter(c => c.types.length > 0);

	// Track which type sections are expanded — initialised from data directly (sidebarCategories is reactive, not available yet)
	let expandedTypes = new Set<string>(data.accounts.map(a => a.typeName));

	function toggleType(typeName: string) {
		if (expandedTypes.has(typeName)) expandedTypes.delete(typeName);
		else expandedTypes.add(typeName);
		expandedTypes = expandedTypes;
	}

	function filterUrl(accountId: number | null) {
		const params = new URLSearchParams($page.url.searchParams);
		if (accountId === null) params.delete('accountId');
		else params.set('accountId', String(accountId));
		params.set('page', '1');
		return `?${params.toString()}`;
	}

	function pageUrl(p: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', String(p));
		return `?${params.toString()}`;
	}

	function pageWindow(current: number, total: number): (number | '…')[] {
		if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
		const pages: (number | '…')[] = [1];
		if (current > 3) pages.push('…');
		for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
		if (current < total - 2) pages.push('…');
		pages.push(total);
		return pages;
	}

	const MONTHS = [
		{ value: '01', label: 'Jan' }, { value: '02', label: 'Feb' },
		{ value: '03', label: 'Mar' }, { value: '04', label: 'Apr' },
		{ value: '05', label: 'May' }, { value: '06', label: 'Jun' },
		{ value: '07', label: 'Jul' }, { value: '08', label: 'Aug' },
		{ value: '09', label: 'Sep' }, { value: '10', label: 'Oct' },
		{ value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
	];

	function dateFilterUrl(year: string | null, month: string | null) {
		const params = new URLSearchParams($page.url.searchParams);
		if (year)  params.set('year',  year);  else params.delete('year');
		if (month) params.set('month', month); else params.delete('month');
		params.set('page', '1');
		return `?${params.toString()}`;
	}

	function onYearChange(e: Event) {
		(e.currentTarget as HTMLSelectElement).form?.submit();
	}

	function onMonthChange(e: Event) {
		(e.currentTarget as HTMLSelectElement).form?.submit();
	}

	import { goto } from '$app/navigation';
	let searchValue = data.search;
	let searchTimer: ReturnType<typeof setTimeout>;

	function onSearch(e: Event) {
		const q = (e.target as HTMLInputElement).value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const params = new URLSearchParams($page.url.searchParams);
			if (q.trim()) params.set('search', q.trim());
			else params.delete('search');
			params.set('page', '1');
			goto(`?${params.toString()}`, { keepFocus: true });
		}, 300);
	}

	// ── Add-row state ────────────────────────────────────────────────────────

	let newFromId = '';
	let newToId   = '';
	let newCurrency = 'EUR';
	let newQuantity = '';
	let newAmountValue = '';
	let newUnitPrice = '';

	// Auto-set currency from "from" account, but allow manual override
	$: {
		const acct = data.accounts.find((a) => String(a.id) === newFromId);
		if (acct) newCurrency = acct.currency;
	}

	$: newSymbol = SYMBOLS[newCurrency] ?? newCurrency;

	$: newToAccount = data.accounts.find((a) => String(a.id) === newToId);
	$: newLinkedCommodity = newToAccount?.commoditySymbol ? newToAccount : null;

	$: if (!newLinkedCommodity) { newQuantity = ''; newAmountValue = ''; }

	$: if (newUnitPrice && newQuantity) {
		const q = parseFloat(newQuantity.replace(',', '.'));
		const p = parseFloat(newUnitPrice.replace(',', '.'));
		if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) newAmountValue = (q * p).toFixed(2);
	}

	// ── Edit-row state ───────────────────────────────────────────────────────

	let expandedNoteId: number | null = null;
	function toggleNote(id: number) { expandedNoteId = expandedNoteId === id ? null : id; }

	let editingId: number | null = null;
	let editDate = '';
	let editDescription = '';
	let editNotes = '';
	let editFromId = '';
	let editToId = '';
	let editAmount = '';
	let editCurrency = 'EUR';

	$: editSymbol = SYMBOLS[editCurrency] ?? editCurrency;

	function startEdit(tx: (typeof data.txList)[number]) {
		const from = tx.entries.find((e) => e.amount < 0);
		const to   = tx.entries.find((e) => e.amount > 0);
		editingId       = tx.id;
		editDate        = tx.date;
		editDescription = tx.description;
		editNotes       = tx.notes ?? '';
		editFromId      = String(from?.accountId ?? '');
		editToId        = String(to?.accountId ?? '');
		editAmount      = from ? (Math.abs(from.amount) / 100).toFixed(2) : '';
		editCurrency    = from?.currency ?? 'EUR';
	}

	function cancelEdit() { editingId = null; }

	// ── Display helpers ──────────────────────────────────────────────────────

	type Entry = (typeof data.txList)[number]['entries'][number];

	function txSimple(entries: Entry[]) {
		if (entries.length !== 2) return null;
		const from = entries.find((e) => e.amount < 0);
		const to   = entries.find((e) => e.amount > 0);
		if (!from || !to) return null;
		return { fromName: from.accountName, toName: to.accountName,
		          amount: Math.abs(from.amount) / 100, currency: from.currency };
	}

	function fmtAmount(n: number, cur: string) {
		return new Intl.NumberFormat('de-DE', {
			style: 'currency', currency: cur, minimumFractionDigits: 2
		}).format(n);
	}

	function fmtDate(d: string) {
		const [y, m, day] = d.split('-').map(Number);
		return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
			.format(new Date(y, m - 1, day));
	}

	function todayISO() {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}
</script>

<svelte:head>
	<title>Transactions — Personal Finance</title>
</svelte:head>

<!--
  Two hidden forms outside the table.
  Table inputs reference them via the HTML5 `form` attribute.
-->
<form id="new-tx"  method="POST" action="?/create"></form>
<form id="edit-tx" method="POST" action="?/update"></form>

<div class="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex gap-6 items-start">

	<!-- ── Sidebar filter ───────────────────────────────────────────────── -->
	<div class="w-80 flex-shrink-0 flex flex-col gap-4 sticky top-6">

	<!-- Date filter card -->
	<div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
		<div class="px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
			<p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Date</p>
		</div>
		<form method="get" action="" class="px-3 py-2.5 flex items-center gap-2">
			<!-- Preserve non-date params -->
			{#if data.filterAccountId}<input type="hidden" name="accountId" value={data.filterAccountId}/>{/if}
			{#if data.search}<input type="hidden" name="search" value={data.search}/>{/if}
			<input type="hidden" name="page" value="1"/>

			<select name="year"
				class="flex-1 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
				on:change={onYearChange}>
				<option value="">All years</option>
				{#each data.availableYears as year}
					<option value={year} selected={data.filterYear === year}>{year}</option>
				{/each}
			</select>

			<select name="month"
				class="flex-1 text-xs rounded border border-gray-200 dark:border-gray-600 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors
					{data.filterYear
						? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200'
						: 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'}"
				disabled={!data.filterYear}
				on:change={onMonthChange}>
				<option value="">All months</option>
				{#each MONTHS as m}
					<option value={m.value} selected={data.filterMonth === m.value}>{m.label}</option>
				{/each}
			</select>

			{#if data.filterYear}
				<a href={dateFilterUrl(null, null)}
					class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
					title="Clear date filter">
					<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</a>
			{/if}
		</form>
	</div>

	<!-- Account filter card -->
	<aside class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
		<div class="px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
			<p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Filter</p>
		</div>
		<nav class="py-1.5 text-xs">
			<a href={filterUrl(null)}
				class="flex items-center px-3 py-1.5 transition-colors
					{data.filterAccountId === null
						? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
						: 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}">
				All transactions
			</a>

			{#each sidebarCategories as cat}
				{@const clr = CATEGORY_COLORS[cat.category]}
				<div class="mt-1">
					<p class="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider {clr.heading} {clr.section}">{cat.label}</p>
					{#each cat.types as typeGroup}
						{#if expandedTypes.has(typeGroup.typeName)}
							{#each typeGroup.accounts as acct}
								<a href={filterUrl(acct.id)}
									class="flex items-center pl-5 pr-3 py-1 transition-colors
										{data.filterAccountId === acct.id
											? clr.active + ' font-medium'
											: clr.link + ' hover:bg-gray-50 dark:hover:bg-gray-700'}">
									{acct.name}
								</a>
							{/each}
						{/if}
					{/each}
				</div>
			{/each}
		</nav>
	</aside>

	</div> <!-- end sidebar wrapper -->

	<!-- ── Main content ──────────────────────────────────────────────────── -->
	<div class="flex-1 min-w-0">

	<div class="flex items-center justify-between mb-4">
		<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Transactions</h1>
		<button type="button" on:click={() => showStarredOnly = !showStarredOnly}
			class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
			       {showStarredOnly
			           ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
			           : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}">
			<svg class="w-3.5 h-3.5 {showStarredOnly ? 'fill-amber-500' : ''}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
				<path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
			</svg>
			Starred
		</button>
	</div>

	<div class="relative mb-4 max-w-xs">
		<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none"
			fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
		</svg>
		<input
			type="search"
			placeholder="Search description or notes…"
			value={searchValue}
			on:input={onSearch}
			class="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
		/>
	</div>

	{#if form?.error}
		<div class="mb-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
			{form.error}
		</div>
	{/if}

	<!-- overflow-visible so dropdown panels aren't clipped by the table container -->
	<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-visible">
		<div class="overflow-x-auto">
		<table class="w-full text-sm">

			<!-- ── Head ─────────────────────────────────────────────────────── -->
			<thead>
				<tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-left">
					<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-36">Date</th>
					<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Description</th>
					<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-44">From</th>
					<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-44">To</th>
					<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-44">Amount</th>
					<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-36">Notes</th>
					<th class="px-3 py-3 w-8"></th>
					<th class="px-3 py-3 w-20"></th>
				</tr>
			</thead>

			<tbody>

				<!-- ── Add row (always visible) ──────────────────────────────── -->
				<tr class="border-b-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 align-middle">

					<td class="px-2 py-2">
						<input form="new-tx" name="date" type="date" required value={todayISO()}
							class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
					</td>

					<td class="px-2 py-2">
						<input form="new-tx" name="description" type="text" required placeholder="Description…"
							class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
					</td>

					<td class="px-2 py-2">
						<AccountDropdown
							{grouped}
							formId="new-tx"
							name="fromAccountId"
							placeholder="From…"
							bind:value={newFromId}
						/>
					</td>

					<td class="px-2 py-2">
						<AccountDropdown
							{grouped}
							formId="new-tx"
							name="toAccountId"
							placeholder="To…"
							disabledId={newFromId}
							bind:value={newToId}
						/>
					</td>

					<!-- Amount + currency select (+ quantity if investment account) -->
					<td class="px-2 py-2">
						{#if newLinkedCommodity}
							<div class="flex items-center gap-1">
								<input form="new-tx" name="quantity" type="number" inputmode="decimal"
									min="0.001" step="0.001" placeholder="units"
									bind:value={newQuantity}
									class="w-20 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
								<span class="text-xs text-gray-400">×</span>
								<input type="number" inputmode="decimal"
									min="0.01" step="0.01" placeholder="price"
									bind:value={newUnitPrice}
									class="w-20 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
								<input form="new-tx" name="amount" type="hidden" value={newAmountValue} />
								<input form="new-tx" type="hidden" name="currency" value={newCurrency} />
								<span class="text-xs text-gray-500 dark:text-gray-400 font-mono">{newAmountValue ? `${newSymbol}${newAmountValue}` : '—'}</span>
							</div>
						{:else}
							<div class="flex items-center gap-1">
								<div class="relative flex-1">
									<span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-xs pointer-events-none">{newSymbol}</span>
									<input form="new-tx" name="amount" type="number" inputmode="decimal"
										required min="0.01" step="0.01" placeholder="0.00"
										class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white pl-5 pr-1 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
								</div>
								<select form="new-tx" name="currency" bind:value={newCurrency}
									class="rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-1.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
									{#each CURRENCIES as c}
										<option value={c}>{c}</option>
									{/each}
								</select>
							</div>
						{/if}
					</td>

					<td class="px-2 py-2">
						<input form="new-tx" name="notes" type="text" placeholder="Notes…"
							class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
					</td>

					<td class="px-2 py-2"></td>
					<td class="px-2 py-2">
						<button form="new-tx" type="submit"
							class="w-full rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
							Add
						</button>
					</td>
				</tr>

				<!-- ── Existing transactions ──────────────────────────────────── -->
				{#if txList.length === 0}
					<tr>
						<td colspan="9" class="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
							{showStarredOnly ? 'No starred transactions.' : 'No transactions yet. Use the row above to add your first one.'}
						</td>
					</tr>
				{:else}
					{#each txList as tx}
						{@const simple = txSimple(tx.entries)}

						{#if editingId === tx.id}
							<!-- ── Edit row ─────────────────────────────────────────── -->
							<tr class="border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 align-middle">

								<td class="px-2 py-2">
									<!-- txId must travel with the edit form -->
									<input form="edit-tx" type="hidden" name="txId" value={tx.id} />
									<input form="edit-tx" name="date" type="date" required bind:value={editDate}
										class="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400" />
								</td>

								<td class="px-2 py-2">
									<input form="edit-tx" name="description" type="text" required bind:value={editDescription}
										class="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400" />
								</td>

								<td class="px-2 py-2">
									<AccountDropdown
										{grouped}
										formId="edit-tx"
										name="fromAccountId"
										borderClass="border-amber-300"
										ringClass="focus:ring-amber-400"
										bind:value={editFromId}
									/>
								</td>

								<td class="px-2 py-2">
									<AccountDropdown
										{grouped}
										formId="edit-tx"
										name="toAccountId"
										borderClass="border-amber-300"
										ringClass="focus:ring-amber-400"
										disabledId={editFromId}
										bind:value={editToId}
									/>
								</td>

								<td class="px-2 py-2">
									<div class="flex items-center gap-1">
										<div class="relative flex-1">
											<span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-xs pointer-events-none">{editSymbol}</span>
											<input form="edit-tx" name="amount" type="number" inputmode="decimal"
												required min="0.01" step="0.01" bind:value={editAmount}
												class="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-700 dark:text-white pl-5 pr-1 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-amber-400" />
										</div>
										<select form="edit-tx" name="currency" bind:value={editCurrency}
											class="rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-700 dark:text-white px-1.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400">
											{#each CURRENCIES as c}
												<option value={c}>{c}</option>
											{/each}
										</select>
									</div>
								</td>

								<td class="px-2 py-2">
									<input form="edit-tx" name="notes" type="text" bind:value={editNotes}
										placeholder="Notes…"
										class="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400" />
								</td>

								<td class="px-2 py-2"></td>
								<td class="px-2 py-2">
									<div class="flex flex-col gap-1">
										<button form="edit-tx" type="submit"
											class="w-full rounded-lg bg-green-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors focus:outline-none">
											Save
										</button>
										<button type="button" on:click={cancelEdit}
											class="w-full rounded-lg bg-gray-100 dark:bg-gray-700 px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">
											Cancel
										</button>
									</div>
								</td>
							</tr>

						{:else}
							<!-- ── Display row ───────────────────────────────────────── -->
							<tr class="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">

								<td class="px-3 py-3 text-gray-400 dark:text-gray-500 font-mono text-xs whitespace-nowrap">
									{fmtDate(tx.date)}
								</td>

								<td class="px-3 py-3 text-gray-900 dark:text-white font-medium">
									{tx.description}
								</td>

								<td class="px-3 py-3 text-gray-600 dark:text-gray-400 text-xs">
									{#if simple}{simple.fromName}{:else}<span class="text-gray-400 dark:text-gray-500 italic">{tx.entries.length}-leg</span>{/if}
								</td>

								<td class="px-3 py-3 text-gray-600 dark:text-gray-400 text-xs">
									{#if simple}{simple.toName}{/if}
								</td>

								<td class="px-3 py-3 text-right font-mono tabular-nums text-gray-900 dark:text-white text-xs">
									{#if simple}
										{fmtAmount(simple.amount, simple.currency)}
									{:else}
										{#each [...new Set(tx.entries.map((e) => e.currency))] as cur}
											<div>{fmtAmount(tx.entries.filter((e) => e.amount > 0 && e.currency === cur).reduce((s, e) => s + e.amount, 0) / 100, cur)}</div>
										{/each}
									{/if}
								</td>

								<td class="px-3 py-3 text-xs max-w-[140px]"
									on:click={() => tx.notes && toggleNote(tx.id)}>
									{#if tx.notes}
										<span class="{expandedNoteId === tx.id
											? 'text-gray-600 dark:text-gray-300 whitespace-normal break-words cursor-pointer'
											: 'text-gray-400 dark:text-gray-500 truncate block cursor-pointer hover:text-gray-600 dark:hover:text-gray-300'}">
											{tx.notes}
										</span>
									{/if}
								</td>

								<!-- Star toggle -->
								<td class="px-2 py-3 text-center w-8">
									<form method="POST" action="?/toggleStar">
										<input type="hidden" name="txId" value={tx.id} />
										<button type="submit" title={tx.isStarred ? 'Unstar' : 'Star'}
											class="p-1 rounded transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
											<svg class="w-3.5 h-3.5 {tx.isStarred ? 'fill-amber-400 text-amber-400' : 'fill-none text-gray-300 dark:text-gray-600 hover:text-amber-400'}"
												viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
											</svg>
										</button>
									</form>
								</td>

								<td class="px-3 py-3 text-right">
									{#if simple}
										<button type="button" on:click={() => startEdit(tx)}
											class="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
											Edit
										</button>
									{:else}
										<span class="text-gray-300 dark:text-gray-600 text-xs" title="Multi-leg transactions cannot be edited here">—</span>
									{/if}
								</td>
							</tr>
						{/if}
					{/each}
				{/if}

			</tbody>
		</table>
		</div>
	</div>

	<div class="mt-3 flex items-center justify-between">
		<p class="text-xs text-gray-400 dark:text-gray-500">
			{showStarredOnly
				? `${txList.length} starred`
				: `${data.total} transaction${data.total === 1 ? '' : 's'} · page ${data.page} of ${data.totalPages}`}
		</p>
		{#if !showStarredOnly && data.totalPages > 1}
			{@const win = pageWindow(data.page, data.totalPages)}
			<div class="flex items-center gap-1">
				<!-- First -->
				<a href={pageUrl(1)}
					class="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 transition-colors
						{data.page <= 1
							? 'pointer-events-none text-gray-300 dark:text-gray-600'
							: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
					aria-disabled={data.page <= 1}>«</a>
				<!-- Prev -->
				<a href={pageUrl(data.page - 1)}
					class="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 transition-colors
						{data.page <= 1
							? 'pointer-events-none text-gray-300 dark:text-gray-600'
							: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
					aria-disabled={data.page <= 1}>‹</a>

				<!-- Page window -->
				{#each win as p}
					{#if p === '…'}
						<span class="px-1.5 py-1 text-xs text-gray-300 dark:text-gray-600">…</span>
					{:else}
						<a href={pageUrl(p)}
							class="px-2.5 py-1 text-xs rounded border transition-colors
								{p === data.page
									? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold'
									: 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}">
							{p}
						</a>
					{/if}
				{/each}

				<!-- Next -->
				<a href={pageUrl(data.page + 1)}
					class="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 transition-colors
						{data.page >= data.totalPages
							? 'pointer-events-none text-gray-300 dark:text-gray-600'
							: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
					aria-disabled={data.page >= data.totalPages}>›</a>
				<!-- Last -->
				<a href={pageUrl(data.totalPages)}
					class="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 transition-colors
						{data.page >= data.totalPages
							? 'pointer-events-none text-gray-300 dark:text-gray-600'
							: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
					aria-disabled={data.page >= data.totalPages}>»</a>
			</div>
		{/if}
	</div>

	</div> <!-- end main content -->
</div>
