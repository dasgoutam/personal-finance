import { redirect } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { accounts, accountTypes, commodities, journalEntries, transactions } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	// Recent transactions with the count of journal entry legs
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

	const mode = url.searchParams.get('mode') ?? 'month'  // 'month' | 'year'
	const year = url.searchParams.get('year') ?? String(new Date().getFullYear())
	const month = url.searchParams.get('month') ?? String(new Date().getMonth() + 1).padStart(2, '0')

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
			// only filter by month if mode is 'month'
			mode === 'month'
				? sql`strftime('%m', ${transactions.date}) = ${month}`
				: undefined
			)
			)
		.groupBy(accounts.name)
		.orderBy(sql`sum(${journalEntries.amount}) desc`)

	return { recentTransactions, accountBalances, expenseGrouping, mode, year, month };
};
