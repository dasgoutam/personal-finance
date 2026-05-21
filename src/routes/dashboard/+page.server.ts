import { redirect } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { accounts, accountTypes, commodities, journalEntries, transactions } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const now = new Date()

	// Last day of previous month — used for MoM comparisons
	const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
	const prevMonthEndStr = prevMonthEnd.toISOString().slice(0, 10)

	// Last 3 completed months helpers
	const last3Months = Array.from({ length: 3 }, (_, i) => {
		const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)
		return {
			year: String(d.getFullYear()),
			month: String(d.getMonth() + 1).padStart(2, '0'),
			label: d.toLocaleString('default', { month: 'short', year: '2-digit' })
		}
	}).reverse()

	// Recent transactions
	const recentTransactions = await db
		.select({
			id: transactions.id,
			date: transactions.date,
			description: transactions.description,
			notes: transactions.notes,
			entryCount: sql<number>`count(${journalEntries.id})`
		})
		.from(transactions)
		.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
		.groupBy(transactions.id)
		.orderBy(desc(transactions.date), desc(transactions.id))
		.limit(20);

	// Per-account balances with type info
	const accountBalances = await db
		.select({
			id: accounts.id,
			name: accounts.name,
			currency: accounts.currency,
			typeName: accountTypes.name,
			typeCategory: accountTypes.category,
			commoditySymbol: commodities.symbol,
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			units: sql<number>`coalesce(sum(${journalEntries.quantity}), 0)`
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(commodities, eq(commodities.id, accounts.commodityId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.where(eq(accounts.isActive, true))
		.groupBy(accounts.id)
		.orderBy(accountTypes.name, accounts.name);

	const mode = url.searchParams.get('mode') ?? 'month'
	const year = url.searchParams.get('year') ?? String(now.getFullYear())
	const month = url.searchParams.get('month') ?? String(now.getMonth() + 1).padStart(2, '0')

	const expenseGrouping = await db
		.select({
			category: accounts.name,
			total: sql<number>`sum(${journalEntries.amount})`,
		})
		.from(journalEntries)
		.innerJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.innerJoin(accounts, eq(journalEntries.accountId, accounts.id))
		.where(and(
			eq(accounts.accountTypeId, 7),
			sql`strftime('%Y', ${transactions.date}) = ${year}`,
			mode === 'month'
				? sql`strftime('%m', ${transactions.date}) = ${month}`
				: undefined
		))
		.groupBy(accounts.name)
		.orderBy(sql`sum(${journalEntries.amount}) desc`)

	// Net worth as of end of previous month
	const prevNetWorthRows = await db
		.select({
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			typeCategory: accountTypes.category,
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.leftJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.where(and(
			eq(accounts.isActive, true),
			sql`(${transactions.date} IS NULL OR ${transactions.date} <= ${prevMonthEndStr})`
		))
		.groupBy(accountTypes.category)

	const prevNetWorth = prevNetWorthRows.reduce((sum, r) => {
		if (r.typeCategory === 'asset')     return sum + r.balance
		if (r.typeCategory === 'liability') return sum - r.balance
		return sum
	}, 0)

	// Total invested (current)
	const investmentRows = await db
		.select({
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			currency: accounts.currency,
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.where(and(
			eq(accounts.isActive, true),
			sql`${accountTypes.name} IN ('Stocks', 'ETF', 'Crypto')`
		))
		.groupBy(accounts.currency)

	// Total invested as of end of previous month
	const prevInvestmentRows = await db
		.select({
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			currency: accounts.currency,
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.leftJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.where(and(
			eq(accounts.isActive, true),
			sql`${accountTypes.name} IN ('Stocks', 'ETF', 'Crypto')`,
			sql`(${transactions.date} IS NULL OR ${transactions.date} <= ${prevMonthEndStr})`
		))
		.groupBy(accounts.currency)

	// Monthly income: last 3 months
	const monthlyIncomeRows = await db
		.select({
			yearMonth: sql<string>`strftime('%Y-%m', ${transactions.date})`,
			total: sql<number>`-sum(${journalEntries.amount})`,
		})
		.from(journalEntries)
		.innerJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.innerJoin(accounts, eq(journalEntries.accountId, accounts.id))
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.where(and(
			eq(accountTypes.category, 'income'),
			sql`strftime('%Y-%m', ${transactions.date}) IN (${sql.join(last3Months.map(m => sql`${m.year + '-' + m.month}`), sql`, `)})`
		))
		.groupBy(sql`strftime('%Y-%m', ${transactions.date})`)

	const monthlyIncome = last3Months.map(m => ({
		label: m.label,
		total: monthlyIncomeRows.find(r => r.yearMonth === `${m.year}-${m.month}`)?.total ?? 0
	}))

	// Monthly expenses: last 3 months
	const monthlyExpenseRows = await db
		.select({
			yearMonth: sql<string>`strftime('%Y-%m', ${transactions.date})`,
			total: sql<number>`sum(${journalEntries.amount})`,
		})
		.from(journalEntries)
		.innerJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.innerJoin(accounts, eq(journalEntries.accountId, accounts.id))
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.where(and(
			eq(accountTypes.category, 'expense'),
			sql`strftime('%Y-%m', ${transactions.date}) IN (${sql.join(last3Months.map(m => sql`${m.year + '-' + m.month}`), sql`, `)})`
		))
		.groupBy(sql`strftime('%Y-%m', ${transactions.date})`)

	const monthlyExpenses = last3Months.map(m => ({
		label: m.label,
		total: monthlyExpenseRows.find(r => r.yearMonth === `${m.year}-${m.month}`)?.total ?? 0
	}))

	return {
		recentTransactions, accountBalances, expenseGrouping, mode, year, month,
		totalInvested: investmentRows,
		prevNetWorth,
		prevTotalInvested: prevInvestmentRows,
		monthlyIncome,
		monthlyExpenses,
	};
};
