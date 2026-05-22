import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '$lib/server/db'
import { accounts, accountTypes, journalEntries, transactions } from '$lib/server/db/schema'

export async function loadNetWorth(prevMonthEndStr: string) {
	const [accountBalances, recentTransactions, prevNetWorthRows] = await Promise.all([
		db.select({
			id: accounts.id,
			name: accounts.name,
			currency: accounts.currency,
			typeName: accountTypes.name,
			typeCategory: accountTypes.category,
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			units: sql<number>`coalesce(sum(${journalEntries.quantity}), 0)`,
		})
			.from(accounts)
			.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
			.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
			.where(eq(accounts.isActive, true))
			.groupBy(accounts.id)
			.orderBy(accountTypes.name, accounts.name),

		db.select({
			id: transactions.id,
			date: transactions.date,
			description: transactions.description,
			notes: transactions.notes,
			entryCount: sql<number>`count(${journalEntries.id})`,
		})
			.from(transactions)
			.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
			.groupBy(transactions.id)
			.orderBy(desc(transactions.date), desc(transactions.id))
			.limit(20),

		db.select({
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
			.groupBy(accountTypes.category),
	])

	const prevNetWorth = prevNetWorthRows.reduce((sum, r) => {
		if (r.typeCategory === 'asset')     return sum + r.balance
		if (r.typeCategory === 'liability') return sum - r.balance
		return sum
	}, 0)

	return { accountBalances, recentTransactions, prevNetWorth }
}
