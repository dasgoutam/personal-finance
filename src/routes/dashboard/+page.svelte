<script lang="ts">
	import NetWorthCard from '$lib/components/dashboard/NetWorthCard.svelte'
	import BankAccountsCard from '$lib/components/dashboard/BankAccountsCard.svelte'
	import TotalInvestedCard from '$lib/components/dashboard/TotalInvestedCard.svelte'
	import MonthlyBarCard from '$lib/components/dashboard/MonthlyBarCard.svelte'
	import ExpensesPanel from '$lib/components/dashboard/ExpensesPanel.svelte'
	import PortfolioBreakdownPanel from '$lib/components/dashboard/PortfolioBreakdownPanel.svelte'

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

<div class="p-6 max-w-7xl mx-auto space-y-4">

	<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
		<NetWorthCard {netWorth} prevNetWorth={data.prevNetWorth} />
		<TotalInvestedCard rows={data.totalInvested} prevRows={data.prevTotalInvested} />
		<MonthlyBarCard title="Monthly Income" months={data.monthlyIncome} />
		<MonthlyBarCard title="Monthly Expenses" months={data.monthlyExpenses} />
	</div>

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<PortfolioBreakdownPanel accounts={data.accountBalances} />
	</div>
		<ExpensesPanel
			grouping={data.expenseGrouping}
			mode={data.mode}
			month={data.month}
			year={data.year}
		/>	

	<BankAccountsCard accounts={bankAccounts} />

</div>
