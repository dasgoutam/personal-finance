import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { accounts, accountTypes, journalEntries, transactions } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const date = url.searchParams.get('date');
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) error(400, 'date param required (YYYY-MM-DD)');

	// Sum journal entries up to and including `date` for all non-commodity asset accounts
	const rows = await db
		.select({
			accountId: accounts.id,
			accountName: accounts.name,
			currency: accounts.currency,
			typeName: accountTypes.name,
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(
			journalEntries,
			and(
				eq(journalEntries.accountId, accounts.id),
				lte(
					sql`(select t.date from transactions t where t.id = ${journalEntries.transactionId})`,
					date
				)
			)
		)
		.where(
			and(
				eq(accountTypes.category, 'asset'),
				isNull(accounts.commodityId),
				eq(accounts.isActive, true)
			)
		)
		.groupBy(accounts.id, accounts.name, accounts.currency, accountTypes.name)
		.orderBy(accountTypes.name, accounts.name);

	return json(rows);
};
