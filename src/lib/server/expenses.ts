import { and, eq, sql } from 'drizzle-orm'
import { db } from '$lib/server/db'
import { accounts, journalEntries, transactions } from '$lib/server/db/schema'

export async function loadExpenses(mode: string, year: string, month: string) {
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

	return { expenseGrouping }
}
