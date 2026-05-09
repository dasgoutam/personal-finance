<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import AccountDropdown from '$lib/components/AccountDropdown.svelte';

	export let data: PageData;
	export let form: ActionData;

	// ── Constants ────────────────────────────────────────────────────────────

	const CURRENCIES = ['EUR', 'INR', 'USD', 'GBP', 'CHF'];
	const SYMBOLS: Record<string, string> = { EUR: '€', INR: '₹', USD: '$', GBP: '£', CHF: 'Fr' };

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

	// ── Add-row state ────────────────────────────────────────────────────────

	let newFromId = '';
	let newToId   = '';
	let newCurrency = 'EUR';

	// Auto-set currency from "from" account, but allow manual override
	$: {
		const acct = data.accounts.find((a) => String(a.id) === newFromId);
		if (acct) newCurrency = acct.currency;
	}

	$: newSymbol = SYMBOLS[newCurrency] ?? newCurrency;

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

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

	<div class="flex items-center justify-between mb-6">
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

					<!-- Amount + currency select -->
					<td class="px-2 py-2">
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

	<p class="mt-3 text-xs text-gray-400 dark:text-gray-500">
		{showStarredOnly ? `${txList.length} starred` : `${data.txList.length} transaction${data.txList.length === 1 ? '' : 's'} total, ${data.txList.filter((t) => t.isStarred).length} starred`}
	</p>
</div>
