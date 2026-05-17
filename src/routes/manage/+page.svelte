<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	export let data: PageData;
	export let form: ActionData;

	const CURRENCIES = ['EUR', 'INR', 'USD', 'GBP', 'CHF'];
	const CATEGORIES = ['asset', 'liability', 'income', 'expense', 'equity'] as const;
	const COMMODITY_TYPES = ['etf', 'stock', 'crypto', 'other'] as const;
	const COMMODITY_TYPE_LABELS: Record<string, string> = { etf: 'ETF', stock: 'Stock', crypto: 'Crypto', other: 'Other' };
	const COMMODITY_TYPE_COLORS: Record<string, string> = {
		etf: 'bg-violet-50 text-violet-700',
		stock: 'bg-sky-50 text-sky-700',
		crypto: 'bg-amber-50 text-amber-700',
		other: 'bg-gray-100 text-gray-600'
	};
	const CATEGORY_LABELS: Record<string, string> = {
		asset: 'Asset', liability: 'Liability', income: 'Income', expense: 'Expense', equity: 'Equity'
	};
	const CATEGORY_COLORS: Record<string, string> = {
		asset: 'bg-blue-50 text-blue-700',
		liability: 'bg-red-50 text-red-700',
		equity: 'bg-purple-50 text-purple-700',
		income: 'bg-green-50 text-green-700',
		expense: 'bg-orange-50 text-orange-700'
	};

	$: activeTab = $page.url.searchParams.get('tab') ?? 'account-types';
	$: error = (form?.error ?? null) as string | null;
	$: errorTab = (form?.tab ?? null) as string | null;

	// Currencies in use
	$: currenciesInUse = [...new Set(data.accounts.map((a) => a.currency))].sort();

	// Account type display name lookup
	function typeName(id: number): string {
		return data.accountTypes.find((t) => t.id === id)?.name ?? '—';
	}

	// Parent type name
	function parentTypeName(parentId: number | null): string {
		if (!parentId) return '—';
		return data.accountTypes.find((t) => t.id === parentId)?.name ?? '—';
	}

	// Group accounts by type name, preserving type metadata
	$: accountGroups = (() => {
		const typeNames = [...new Set(data.accounts.map((a) => a.accountTypeName))].sort();
		return typeNames.map((typeName) => {
			const accounts = data.accounts.filter((a) => a.accountTypeName === typeName);
			return { typeName, category: accounts[0].accountTypeCategory, accounts };
		});
	})();

	// Group account types by category for the custom dropdown
	$: typesByCategory = CATEGORIES
		.map((cat) => ({ category: cat, types: data.accountTypes.filter((t) => t.category === cat) }))
		.filter((g) => g.types.length > 0);

	// Custom type dropdown state
	let typeDropdownOpen = false;
	let selectedTypeId = '';
	let selectedType: typeof data.accountTypes[number] | undefined;
	$: selectedType = data.accountTypes.find((t) => String(t.id) === selectedTypeId);
	$: isInvestmentType = selectedType ? ['ETF', 'Stocks', 'Crypto'].includes(selectedType.name) : false;

	let selectedAccountCommodityId = '';
	$: if (!isInvestmentType) selectedAccountCommodityId = '';

	function selectType(id: number) {
		selectedTypeId = String(id);
		typeDropdownOpen = false;
	}

	// ── Ticker search state ─────────────────────────────────────────────────
	type SearchResult = { symbol: string; name: string; exchange: string; type: string };
	type PriceResult = { price: number | null; currency: string | null; changePercent: number | null };

	let tickerQuery = '';
	let tickerResults: SearchResult[] = [];
	let tickerSearching = false;
	let tickerSelected: SearchResult | null = null;
	let commodityName = '';
	let commodityCurrency = 'EUR';
	let commodityType = 'etf';
	let tickerDropdownOpen = false;

	let searchDebounce: ReturnType<typeof setTimeout>;
	function onTickerInput() {
		clearTimeout(searchDebounce);
		tickerSelected = null;
		if (tickerQuery.length < 1) { tickerResults = []; return; }
		searchDebounce = setTimeout(async () => {
			tickerSearching = true;
			const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(tickerQuery)}`);
			tickerResults = res.ok ? await res.json() : [];
			tickerDropdownOpen = tickerResults.length > 0;
			tickerSearching = false;
		}, 300);
	}

	function selectTicker(r: SearchResult) {
		tickerSelected = r;
		tickerQuery = r.symbol;
		commodityName = r.name;
		commodityType = r.type;
		tickerDropdownOpen = false;
		tickerResults = [];
		// Guess currency: crypto/DE-suffix → EUR, US stocks → USD
		if (r.type === 'crypto') commodityCurrency = 'EUR';
		else if (r.symbol.endsWith('.DE') || r.exchange === 'GER' || r.exchange === 'XETRA') commodityCurrency = 'EUR';
		else commodityCurrency = 'EUR'; // default EUR since user is in Germany
	}

	// Live prices for existing commodities
	type PriceMap = Record<number, PriceResult & { loading: boolean; error?: string }>;
	let prices: PriceMap = {};

	async function fetchPrices() {
		for (const c of data.commodities) {
			prices[c.id] = { price: null, currency: null, changePercent: null, loading: true };
			prices = prices;
			fetch(`/api/ticker-price?symbol=${encodeURIComponent(c.symbol)}`)
				.then((r) => r.json())
				.then((d) => {
					if (d.error) {
						prices[c.id] = { price: null, currency: null, changePercent: null, loading: false, error: d.error };
					} else {
						prices[c.id] = { price: d.price ?? null, currency: d.currency ?? null, changePercent: d.changePercent ?? null, loading: false };
					}
					prices = prices;
				})
				.catch((e) => {
					prices[c.id] = { price: null, currency: null, changePercent: null, loading: false, error: e.message };
					prices = prices;
				});
		}
	}

	onMount(() => {
		if (activeTab === 'commodities') void fetchPrices();
	});

	// ── Inline account rename state ──────────────────────────────────────────
	let editingAccountId: number | null = null;
	let editingAccountName = '';

	function startRename(acct: { id: number; name: string }) {
		editingAccountId = acct.id;
		editingAccountName = acct.name;
	}

	function cancelRename() { editingAccountId = null; }
</script>

<svelte:head>
	<title>Manage — Personal Finance</title>
</svelte:head>

<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Manage</h1>

	<!-- Tabs -->
	<div class="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
		{#each [['account-types', 'Account Types'], ['accounts', 'Accounts'], ['commodities', 'Commodities'], ['currencies', 'Currencies'], ['import', 'Import']] as [tab, label]}
			<a
				href="/manage?tab={tab}"
				on:click={() => { if (tab === 'commodities') void fetchPrices(); }}
				class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
					{activeTab === tab
					? 'bg-white dark:bg-gray-800 border border-b-white dark:border-b-gray-800 border-gray-200 dark:border-gray-700 text-blue-600 -mb-px'
					: 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'}"
			>
				{label}
			</a>
		{/each}
	</div>

	<!-- Error banner -->
	{#if error && errorTab === activeTab}
		<div class="mb-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
			{error}
		</div>
	{/if}

	<!-- ── Account Types Tab ─────────────────────────────────────────────────── -->
	{#if activeTab === 'account-types'}
		<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-left">
						<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Name</th>
						<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-28">Category</th>
						<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-32">Sub-type of</th>
						<th class="px-3 py-3 w-20"></th>
					</tr>
				</thead>
				<tbody>
					<!-- Add row -->
					<tr class="border-b-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 align-middle">
						<form method="POST" action="?/addAccountType" id="add-type"></form>
						<td class="px-2 py-2">
							<input form="add-type" name="name" type="text" required placeholder="Type name…"
								class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
						</td>
						<td class="px-2 py-2">
							<select form="add-type" name="category" required
								class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
								{#each CATEGORIES as c}
									<option value={c}>{CATEGORY_LABELS[c]}</option>
								{/each}
							</select>
						</td>
						<td class="px-2 py-2">
							<select form="add-type" name="parentId"
								class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
								<option value="">None</option>
								{#each data.accountTypes as t}
									<option value={t.id}>{t.name}</option>
								{/each}
							</select>
						</td>
						<td class="px-2 py-2">
							<button form="add-type" type="submit"
								class="w-full rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">
								Add
							</button>
						</td>
					</tr>

					{#if data.accountTypes.length === 0}
						<tr>
							<td colspan="4" class="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">No account types yet.</td>
						</tr>
					{:else}
						{#each data.accountTypes as t}
							<tr class="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
								<td class="px-3 py-3 text-gray-900 dark:text-white font-medium">
									{t.name}
									{#if t.isDefault}
										<span class="ml-2 text-xs text-gray-400 dark:text-gray-500">(default)</span>
									{/if}
								</td>
								<td class="px-3 py-3">
									<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium {CATEGORY_COLORS[t.category]}">
										{CATEGORY_LABELS[t.category]}
									</span>
								</td>
								<td class="px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">{parentTypeName(t.parentId)}</td>
								<td class="px-3 py-3 text-right">
									{#if t.isDefault}
										<span class="text-gray-300 dark:text-gray-600 text-xs" title="Default types cannot be deleted">🔒</span>
									{:else}
										<form method="POST" action="?/deleteAccountType">
											<input type="hidden" name="id" value={t.id} />
											<button type="submit"
												class="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
												Delete
											</button>
										</form>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
		<p class="mt-3 text-xs text-gray-400 dark:text-gray-500">{data.accountTypes.length} type{data.accountTypes.length === 1 ? '' : 's'}</p>

	<!-- ── Accounts Tab ──────────────────────────────────────────────────────── -->
	{:else if activeTab === 'accounts'}

		<!-- Add account form -->
		<div class="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-4 mb-6">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-3">Add Account</h3>
			<form method="POST" action="?/addAccount" class="flex flex-wrap gap-2 items-end">
				<div class="flex-1 min-w-36">
					<label for="acct-name" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
					<input id="acct-name" name="name" type="text" required placeholder="e.g. HDFC Savings"
						class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
				</div>

				<!-- Custom type dropdown -->
				<div class="w-48">
					<label for="acct-type-btn" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
					<input type="hidden" name="accountTypeId" value={selectedTypeId} required />
					<div class="relative">
						<button id="acct-type-btn" type="button"
							on:click={() => typeDropdownOpen = !typeDropdownOpen}
							class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs text-left flex items-center justify-between gap-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
							{#if selectedType}
								<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium {CATEGORY_COLORS[selectedType.category]}">
									{selectedType.name}
								</span>
							{:else}
								<span class="text-gray-400 dark:text-gray-500">Type…</span>
							{/if}
							<svg class="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>

						{#if typeDropdownOpen}
							<div class="absolute z-20 mt-1 w-full min-w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
								{#each typesByCategory as group}
									<div class="px-2 pt-2 pb-0.5">
										<span class="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
											{CATEGORY_LABELS[group.category]}
										</span>
									</div>
									{#each group.types as t}
										<!-- svelte-ignore a11y-click-events-have-key-events -->
										<!-- svelte-ignore a11y-no-static-element-interactions -->
										<div on:click={() => selectType(t.id)}
											class="mx-1 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
											<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium {CATEGORY_COLORS[t.category]}">
												{t.name}
											</span>
										</div>
									{/each}
								{/each}
							</div>

							<!-- Click-outside overlay -->
							<!-- svelte-ignore a11y-no-static-element-interactions -->
							<!-- svelte-ignore a11y-click-events-have-key-events -->
							<div class="fixed inset-0 z-10" on:click={() => typeDropdownOpen = false}></div>
						{/if}
					</div>
				</div>

				<div class="w-28">
					<label for="acct-currency" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Currency</label>
					<select id="acct-currency" name="currency" required
						class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
						{#each CURRENCIES as c}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</div>
				{#if isInvestmentType}
					<div class="w-40">
						<label for="acct-commodity" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Commodity</label>
						<input type="hidden" name="commodityId" value={selectedAccountCommodityId} />
						<select id="acct-commodity" bind:value={selectedAccountCommodityId}
							class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
							<option value="">None</option>
							{#each data.commodities as c}
								<option value={c.id}>{c.symbol} — {c.name}</option>
							{/each}
						</select>
					</div>
				{/if}
				<div>
					<button type="submit"
						class="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">
						Add
					</button>
				</div>
			</form>
		</div>

		<!-- Grouped account sections -->
		{#if data.accounts.length === 0}
			<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-gray-400 dark:text-gray-500 text-sm">
				No accounts yet. Use the form above to add one.
			</div>
		{:else}
			<div class="space-y-4">
				{#each accountGroups as group}
					<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
						<!-- Group header -->
						<div class="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center gap-2">
							<span class="text-xs font-semibold px-2 py-0.5 rounded-full {CATEGORY_COLORS[group.category]}">
								{group.typeName}
							</span>
							<span class="text-xs text-gray-400 dark:text-gray-500">{group.accounts.length} account{group.accounts.length === 1 ? '' : 's'}</span>
						</div>
						<!-- Accounts in this group -->
						<table class="w-full text-sm">
							<tbody class="divide-y divide-gray-50 dark:divide-gray-700">
								{#each group.accounts as acct}
									{#if editingAccountId === acct.id}
										<!-- ── Rename row ── -->
										<tr class="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-800">
											<td class="px-4 py-2" colspan="2">
												<form method="POST" action="?/renameAccount" class="flex items-center gap-2">
													<input type="hidden" name="id" value={acct.id} />
													<input name="name" type="text" required bind:value={editingAccountName}
														class="flex-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400" />
													<button type="submit"
														class="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors">
														Save
													</button>
													<button type="button" on:click={cancelRename}
														class="rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">
														Cancel
													</button>
												</form>
											</td>
											<td class="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs font-mono w-20">{acct.currency}</td>
											<td class="px-4 py-2 w-28"></td>
										</tr>
									{:else}
										<!-- ── Display row ── -->
										<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors {!acct.isActive ? 'opacity-50' : ''}">
											<td class="px-4 py-2.5 text-gray-900 dark:text-white font-medium">
												{acct.name}
												{#if acct.description}
													<div class="text-xs text-gray-400 dark:text-gray-500 font-normal mt-0.5">{acct.description}</div>
												{/if}
											</td>
											<td class="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs font-mono w-20">
												{acct.currency}
												{#if acct.commoditySymbol}
													<span class="ml-1 text-violet-600 dark:text-violet-400">· {acct.commoditySymbol}</span>
												{/if}
											</td>
											<td class="px-4 py-2.5 w-20">
												{#if !acct.isActive}
													<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Inactive</span>
												{/if}
											</td>
											<td class="px-4 py-2.5 text-right w-36">
												<div class="flex justify-end gap-1">
													<button type="button" on:click={() => startRename(acct)}
														class="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
														Rename
													</button>
													{#if !acct.isActive}
														<form method="POST" action="?/reactivateAccount">
															<input type="hidden" name="id" value={acct.id} />
															<button type="submit" class="rounded-lg px-2.5 py-1 text-xs font-medium text-green-600 hover:text-green-900 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors">
																Restore
															</button>
														</form>
													{/if}
													<form method="POST" action="?/deleteAccount">
														<input type="hidden" name="id" value={acct.id} />
														<button type="submit" class="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
															title={acct.isActive ? 'Deactivate' : 'Delete permanently'}>
															{acct.isActive ? 'Delete' : 'Remove'}
														</button>
													</form>
												</div>
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
				{/each}
			</div>
		{/if}

		<p class="mt-3 text-xs text-gray-400 dark:text-gray-500">
			{data.accounts.filter((a) => a.isActive).length} active,
			{data.accounts.filter((a) => !a.isActive).length} inactive
		</p>

	<!-- ── Commodities Tab ───────────────────────────────────────────────────── -->
	{:else if activeTab === 'commodities'}

		<!-- Add commodity form with ticker search -->
		<div class="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-4 mb-6">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-3">Add Commodity</h3>
			<form method="POST" action="?/addCommodity" class="flex flex-wrap gap-2 items-end">
				<!-- Ticker search -->
				<div class="flex-1 min-w-48 relative">
					<label for="commodity-symbol" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Search ticker</label>
					<input
						id="commodity-symbol"
						type="text"
						name="symbol"
						bind:value={tickerQuery}
						on:input={onTickerInput}
						on:focus={() => { if (tickerResults.length > 0) tickerDropdownOpen = true; }}
						placeholder="VWCE.DE, BTC-EUR…"
						required
						autocomplete="off"
						class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					{#if tickerSearching}
						<span class="absolute right-2 top-7 text-gray-400 text-xs">…</span>
					{/if}
					{#if tickerDropdownOpen && tickerResults.length > 0}
						<div class="absolute z-20 mt-1 w-full min-w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 max-h-56 overflow-y-auto">
							{#each tickerResults as r}
								<!-- svelte-ignore a11y-click-events-have-key-events -->
								<!-- svelte-ignore a11y-no-static-element-interactions -->
								<div on:click={() => selectTicker(r)}
									class="px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
									<span class="font-mono font-semibold text-xs text-gray-900 dark:text-white w-24 shrink-0">{r.symbol}</span>
									<span class="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">{r.name}</span>
									<span class="text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0 {COMMODITY_TYPE_COLORS[r.type]}">{COMMODITY_TYPE_LABELS[r.type]}</span>
								</div>
							{/each}
						</div>
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<div class="fixed inset-0 z-10" on:click={() => tickerDropdownOpen = false}></div>
					{/if}
				</div>

				<!-- Name -->
				<div class="flex-1 min-w-40">
					<label for="commodity-name" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
					<input
						id="commodity-name"
						name="name"
						type="text"
						required
						bind:value={commodityName}
						placeholder="Vanguard FTSE All-World…"
						class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<!-- Type -->
				<div class="w-28">
					<label for="commodity-type" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
					<select id="commodity-type" name="type" required bind:value={commodityType}
						class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
						{#each COMMODITY_TYPES as t}
							<option value={t}>{COMMODITY_TYPE_LABELS[t]}</option>
						{/each}
					</select>
				</div>

				<!-- Currency -->
				<div class="w-24">
					<label for="commodity-currency" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Currency</label>
					<select id="commodity-currency" name="currency" required bind:value={commodityCurrency}
						class="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-700 dark:text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
						{#each CURRENCIES as c}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</div>

				<div>
					<button type="submit"
						class="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">
						Add
					</button>
				</div>
			</form>
		</div>

		<!-- Commodities table -->
		<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-left">
						<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-32">Symbol</th>
						<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Name</th>
						<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-20">Type</th>
						<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-20">Currency</th>
						<th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-36 text-right">Price</th>
						<th class="px-3 py-3 w-20"></th>
					</tr>
				</thead>
				<tbody>
					{#if data.commodities.length === 0}
						<tr>
							<td colspan="6" class="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">No commodities yet. Use the form above to add one.</td>
						</tr>
					{:else}
						{#each data.commodities as commodity}
							{@const p = prices[commodity.id]}
							<tr class="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
								<td class="px-3 py-3 text-gray-900 dark:text-white font-mono font-semibold text-xs">{commodity.symbol}</td>
								<td class="px-3 py-3 text-gray-900 dark:text-white text-xs">{commodity.name}</td>
								<td class="px-3 py-3">
									<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium {COMMODITY_TYPE_COLORS[commodity.type]}">
										{COMMODITY_TYPE_LABELS[commodity.type]}
									</span>
								</td>
								<td class="px-3 py-3 text-gray-600 dark:text-gray-400 text-xs font-mono">{commodity.currency}</td>
								<td class="px-3 py-3 text-right">
									{#if !p || p.loading}
										<span class="text-gray-300 dark:text-gray-600 text-xs">…</span>
									{:else if p.error}
										<span class="text-red-400 text-xs" title={p.error}>error</span>
									{:else if p.price === null}
										<span class="text-gray-400 dark:text-gray-500 text-xs">—</span>
									{:else}
										<span class="text-gray-900 dark:text-white text-xs font-mono font-medium">
											{p.price.toLocaleString('de-DE', { style: 'currency', currency: p.currency ?? commodity.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })}
										</span>
										{#if p.changePercent !== null}
											<span class="ml-1.5 text-[10px] font-medium {p.changePercent >= 0 ? 'text-green-600' : 'text-red-500'}">
												{p.changePercent >= 0 ? '+' : ''}{p.changePercent.toFixed(2)}%
											</span>
										{/if}
									{/if}
								</td>
								<td class="px-3 py-3 text-right">
									<form method="POST" action="?/deleteCommodity">
										<input type="hidden" name="id" value={commodity.id} />
										<button type="submit"
											class="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
											Delete
										</button>
									</form>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
		<p class="mt-3 text-xs text-gray-400 dark:text-gray-500">{data.commodities.length} commodity{data.commodities.length === 1 ? '' : 'ies'}</p>

	<!-- ── Currencies Tab ────────────────────────────────────────────────────── -->
	{:else if activeTab === 'currencies'}
		<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
			<p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
				Currencies are configured per account. The currencies below are currently in use.
			</p>
			{#if currenciesInUse.length === 0}
				<p class="text-sm text-gray-400 dark:text-gray-500 italic">No currencies in use yet.</p>
			{:else}
				<div class="flex flex-wrap gap-2">
					{#each currenciesInUse as cur}
						<span class="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-sm font-mono font-medium text-gray-700 dark:text-gray-300">
							{cur}
						</span>
					{/each}
				</div>
				<p class="mt-4 text-xs text-gray-400 dark:text-gray-500">
					To add a new currency, create an account with that currency on the Accounts tab.
				</p>
			{/if}
		</div>

	<!-- ── Import Tab ────────────────────────────────────────────────────────── -->
	{:else if activeTab === 'import'}
		<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
			<h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Import from .ledger file</h2>
			<p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
				Upload a <span class="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">.ledger</span> file in
				hledger/ledger format. Accounts are created automatically based on path prefixes
				(<code class="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">Assets:*</code> → Bank,
				<code class="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">Assets:Equity:ETF:*</code> → ETF, etc.).
				Run <strong>Clear Data</strong> first to avoid duplicates.
			</p>

			{#if error && errorTab === 'import'}
				<div class="mb-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">{error}</div>
			{/if}

			{#if form?.importResult && form?.tab === 'import'}
				<div class="mb-6 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-4">
					<p class="text-sm font-semibold text-green-800 dark:text-green-300 mb-2">Import complete</p>
					<ul class="text-sm text-green-700 dark:text-green-400 space-y-1">
						<li>{form.importResult.accountsCreated} account{form.importResult.accountsCreated === 1 ? '' : 's'} created</li>
						<li>{form.importResult.commoditiesCreated} commodit{form.importResult.commoditiesCreated === 1 ? 'y' : 'ies'} created</li>
						<li>{form.importResult.transactionsImported} transaction{form.importResult.transactionsImported === 1 ? '' : 's'} imported</li>
					</ul>
					{#if form.importResult.warnings.length > 0}
						<div class="mt-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-3 py-3">
							<p class="text-xs font-semibold text-yellow-800 dark:text-yellow-300 mb-1">Warnings</p>
							<ul class="text-xs text-yellow-700 dark:text-yellow-400 space-y-0.5 list-disc list-inside">
								{#each form.importResult.warnings as warning}
									<li>{warning}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/if}

			<form method="POST" action="?/importLedger" enctype="multipart/form-data" class="flex flex-col gap-4">
				<div>
					<label for="ledger-file" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ledger file</label>
					<input id="ledger-file" name="file" type="file" accept=".ledger,.txt" required
						class="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors" />
				</div>
				<div>
					<button type="submit"
						class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
						Import
					</button>
				</div>
			</form>
		</div>
	{/if}
</div>
