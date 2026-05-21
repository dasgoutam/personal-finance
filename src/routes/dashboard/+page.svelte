<script lang="ts">
	import NetWorthCard from '$lib/components/dashboard/NetWorthCard.svelte'
	import BankAccountsCard from '$lib/components/dashboard/BankAccountsCard.svelte'
	import ExpensesPanel from '$lib/components/dashboard/ExpensesPanel.svelte'

	export let data

	$: bankAccounts = data.accountBalances.filter((a: any) => a.typeName === 'Bank')
	$: netWorth = data.accountBalances.reduce((sum: number, a: any) => {
		if (a.typeCategory === 'asset')     return sum + a.balance
		if (a.typeCategory === 'liability') return sum - a.balance
		return sum
	}, 0)
</script>

<svelte:head>
	<title>Dashboard — Personal Finance</title>
</svelte:head>

<div class="p-4 max-w-2xl space-y-4">

	<div class="grid grid-cols-2 gap-4">
		<NetWorthCard {netWorth} />
		<BankAccountsCard accounts={bankAccounts} />
	</div>

	<ExpensesPanel
		grouping={data.expenseGrouping}
		mode={data.mode}
		month={data.month}
		year={data.year}
	/>

</div>
