import { and, eq, sql } from 'drizzle-orm'
import { db } from '$lib/server/db'
import { accounts, accountTypes, journalEntries, transactions } from '$lib/server/db/schema'

type MonthMeta = { year: string; month: string; label: string }

export async function loadIncome(last3Months: MonthMeta[]) {
	const monthKeys = last3Months.map(m => m.year + '-' + m.month)
	const monthSql = sql.join(monthKeys.map(k => sql`${k}`), sql`, `)

	const [incomeRows, expenseRows] = await Promise.all([
		db.select({
			yearMonth: sql<string>`strftime('%Y-%m', ${transactions.date})`,
			total: sql<number>`-sum(${journalEntries.amount})`,
		})
			.from(journalEntries)
			.innerJoin(transactions, eq(journalEntries.transactionId, transactions.id))
			.innerJoin(accounts, eq(journalEntries.accountId, accounts.id))
			.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
			.where(and(
				eq(accountTypes.category, 'income'),
				sql`strftime('%Y-%m', ${transactions.date}) IN (${monthSql})`
			))
			.groupBy(sql`strftime('%Y-%m', ${transactions.date})`),

		db.select({
			yearMonth: sql<string>`strftime('%Y-%m', ${transactions.date})`,
			total: sql<number>`sum(${journalEntries.amount})`,
		})
			.from(journalEntries)
			.innerJoin(transactions, eq(journalEntries.transactionId, transactions.id))
			.innerJoin(accounts, eq(journalEntries.accountId, accounts.id))
			.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
			.where(and(
				eq(accountTypes.category, 'expense'),
				sql`strftime('%Y-%m', ${transactions.date}) IN (${monthSql})`
			))
			.groupBy(sql`strftime('%Y-%m', ${transactions.date})`),
	])

	const monthlyIncome = last3Months.map(m => ({
		label: m.label,
		total: incomeRows.find(r => r.yearMonth === `${m.year}-${m.month}`)?.total ?? 0,
	}))

	const monthlyExpenses = last3Months.map(m => ({
		label: m.label,
		total: expenseRows.find(r => r.yearMonth === `${m.year}-${m.month}`)?.total ?? 0,
	}))

	return { monthlyIncome, monthlyExpenses }
}
