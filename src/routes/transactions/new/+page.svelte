<script lang="ts">
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	// Today's date in YYYY-MM-DD (local time, not UTC)
	function todayISO() {
		const d = new Date();
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	// Group accounts by type name for <optgroup>
	$: grouped = [...new Set(data.accounts.map((a) => a.typeName))]
		.sort()
		.map((typeName) => ({ label: typeName, accounts: data.accounts.filter((a) => a.typeName === typeName) }))
		.filter((g) => g.accounts.length > 0);

	// Reactive: derive currency from the selected "from" account
	let fromAccountId = '';
	let toAccountId = '';

	$: fromAccount = data.accounts.find((a) => String(a.id) === fromAccountId);
	$: currency = fromAccount?.currency ?? 'EUR';

	// Format currency symbol hint
	const CURRENCY_SYMBOLS: Record<string, string> = {
		EUR: '€',
		INR: '₹',
		USD: '$',
		GBP: '£'
	};
	$: symbol = CURRENCY_SYMBOLS[currency] ?? currency;
</script>

<svelte:head>
	<title>New Transaction — Personal Finance</title>
</svelte:head>

<div class="max-w-xl mx-auto px-4 py-10">
	<!-- Header -->
	<div class="mb-8">
		<a href="/dashboard" class="text-sm text-gray-400 hover:text-gray-600 transition-colors mb-2 inline-block">
			← Dashboard
		</a>
		<h1 class="text-2xl font-bold text-gray-900">New Transaction</h1>
	</div>

	<!-- Error banner -->
	{#if form?.error}
		<div class="mb-6 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
			{form.error}
		</div>
	{/if}

	<form method="POST" class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">

		<!-- Date -->
		<div>
			<label for="date" class="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
			<input
				id="date"
				name="date"
				type="date"
				required
				value={todayISO()}
				class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
			/>
		</div>

		<!-- Description -->
		<div>
			<label for="description" class="block text-sm font-medium text-gray-700 mb-1.5">
				Description
			</label>
			<input
				id="description"
				name="description"
				type="text"
				required
				placeholder="e.g. REWE Einkauf, Miete Februar, Gehalt"
				value={form?.description ?? ''}
				class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
			/>
		</div>

		<!-- From / To accounts -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="fromAccountId" class="block text-sm font-medium text-gray-700 mb-1.5">
					From account
					<span class="text-gray-400 font-normal">(credit)</span>
				</label>
				<select
					id="fromAccountId"
					name="fromAccountId"
					required
					bind:value={fromAccountId}
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				>
					<option value="" disabled selected>Select account…</option>
					{#each grouped as group}
						<optgroup label={group.label}>
							{#each group.accounts as account}
								<option value={account.id}>
									{account.name} ({account.currency})
								</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</div>

			<div>
				<label for="toAccountId" class="block text-sm font-medium text-gray-700 mb-1.5">
					To account
					<span class="text-gray-400 font-normal">(debit)</span>
				</label>
				<select
					id="toAccountId"
					name="toAccountId"
					required
					bind:value={toAccountId}
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				>
					<option value="" disabled selected>Select account…</option>
					{#each grouped as group}
						<optgroup label={group.label}>
							{#each group.accounts as account}
								<option value={account.id} disabled={String(account.id) === fromAccountId}>
									{account.name} ({account.currency})
								</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</div>
		</div>

		<!-- Currency mismatch warning -->
		{#if fromAccountId && toAccountId}
			{@const toAccount = data.accounts.find((a) => String(a.id) === toAccountId)}
			{#if toAccount && toAccount.currency !== currency}
				<div class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-700">
					<strong>Different currencies:</strong> From account is {currency}, To account is {toAccount.currency}.
					The transaction will be booked in <strong>{currency}</strong> for both legs.
					For a proper FX transfer use the seed helper or add a bridge account.
				</div>
			{/if}
		{/if}

		<!-- Amount + currency -->
		<div>
			<label for="amount" class="block text-sm font-medium text-gray-700 mb-1.5">Amount</label>
			<div class="flex items-center gap-2">
				<div class="relative flex-1">
					<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none pointer-events-none">
						{symbol}
					</span>
					<input
						id="amount"
						name="amount"
						type="number"
						inputmode="decimal"
						required
						min="0.01"
						step="0.01"
						placeholder="0.00"
						value={form?.amount ?? ''}
						class="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					/>
				</div>
				<!-- Hidden field carries the resolved currency to the server -->
				<input type="hidden" name="currency" value={currency} />
				<span class="text-sm font-medium text-gray-600 bg-gray-100 rounded-lg px-3 py-2 min-w-[3.5rem] text-center">
					{currency}
				</span>
			</div>
			<p class="mt-1 text-xs text-gray-400">
				Currency is taken from the "From" account.
				{#if !fromAccountId}Select a "From" account first.{/if}
			</p>
		</div>

		<!-- Notes (optional) -->
		<div>
			<label for="notes" class="block text-sm font-medium text-gray-700 mb-1.5">
				Notes
				<span class="text-gray-400 font-normal">(optional)</span>
			</label>
			<textarea
				id="notes"
				name="notes"
				rows="2"
				placeholder="Any extra details…"
				class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
			>{form?.notes ?? ''}</textarea>
		</div>

		<!-- Submit -->
		<div class="flex items-center justify-between pt-2">
			<a
				href="/dashboard"
				class="text-sm text-gray-500 hover:text-gray-700 transition-colors"
			>
				Cancel
			</a>
			<button
				type="submit"
				class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
			>
				Save transaction
			</button>
		</div>
	</form>

	<!-- Quick reference -->
	<div class="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4 text-xs text-gray-500 space-y-1">
		<p class="font-medium text-gray-600">How From / To works</p>
		<p>Paying rent: <strong>From</strong> DKB Girokonto → <strong>To</strong> Miete</p>
		<p>Receiving salary: <strong>From</strong> Gehalt → <strong>To</strong> DKB Girokonto</p>
		<p>Saving: <strong>From</strong> DKB Girokonto → <strong>To</strong> DKB Tagesgeld</p>
	</div>
</div>
