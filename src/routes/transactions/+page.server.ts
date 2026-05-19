import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { accounts, accountTypes, commodities, journalEntries, transactions } from '$lib/server/db/schema';
import { createTransaction } from '$lib/server/finance';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');

	const page       = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
	const accountIdParam = url.searchParams.get('accountId');
	const filterAccountId = accountIdParam ? parseInt(accountIdParam, 10) : null;
	const search = url.searchParams.get('search')?.trim() ?? '';
	const filterYear  = url.searchParams.get('year')  ?? null;
	const filterMonth = url.searchParams.get('month') ?? null;

	// Build a WHERE clause combining all filters
	const where = and(
		filterAccountId ? eq(journalEntries.accountId, filterAccountId) : undefined,
		search ? or(
			like(transactions.description, `%${search}%`),
			like(transactions.notes, `%${search}%`)
		) : undefined,
		filterYear  ? like(transactions.date, `${filterYear}%`) : undefined,
		filterYear && filterMonth
			? like(transactions.date, `${filterYear}-${filterMonth.padStart(2, '0')}%`)
			: undefined
	);

	// Available years for the date filter card
	const availableYears = (await db
		.selectDistinct({ year: sql<string>`substr(${transactions.date}, 1, 4)` })
		.from(transactions)
		.orderBy(sql`substr(${transactions.date}, 1, 4) desc`)
	).map(r => r.year);

	const [{ total }] = await db
		.select({ total: sql<number>`count(distinct ${transactions.id})` })
		.from(transactions)
		.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
		.where(where);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const safePage   = Math.min(page, totalPages);

	const pageIds = (await db
		.selectDistinct({ id: transactions.id, date: transactions.date })
		.from(transactions)
		.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
		.where(where)
		.orderBy(desc(transactions.date), desc(transactions.id))
		.limit(PAGE_SIZE)
		.offset((safePage - 1) * PAGE_SIZE)
	).map(r => r.id);

	const rows = pageIds.length === 0 ? [] : await db
		.select({
			txId: transactions.id,
			txDate: transactions.date,
			txDescription: transactions.description,
			txNotes: transactions.notes,
			txIsStarred: transactions.isStarred,
			jeId: journalEntries.id,
			jeAmount: journalEntries.amount,
			jeCurrency: journalEntries.currency,
			acctId: accounts.id,
			acctName: accounts.name
		})
		.from(transactions)
		.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
		.leftJoin(accounts, eq(accounts.id, journalEntries.accountId))
		.where(inArray(transactions.id, pageIds))
		.orderBy(desc(transactions.date), desc(transactions.id));

	const txMap = new Map<
		number,
		{
			id: number;
			date: string;
			description: string;
			notes: string | null;
			isStarred: boolean;
			entries: { id: number; amount: number; currency: string; accountId: number; accountName: string }[];
		}
	>();

	for (const row of rows) {
		if (!txMap.has(row.txId)) {
			txMap.set(row.txId, {
				id: row.txId,
				date: row.txDate,
				description: row.txDescription,
				notes: row.txNotes,
				isStarred: row.txIsStarred,
				entries: []
			});
		}
		if (row.jeId !== null && row.acctId !== null) {
			txMap.get(row.txId)!.entries.push({
				id: row.jeId,
				amount: row.jeAmount!,
				currency: row.jeCurrency!,
				accountId: row.acctId,
				accountName: row.acctName!
			});
		}
	}

	const allAccounts = await db
		.select({
			id: accounts.id,
			name: accounts.name,
			currency: accounts.currency,
			typeName: accountTypes.name,
			typeCategory: accountTypes.category,
			commodityId: accounts.commodityId,
			commoditySymbol: commodities.symbol,
			commodityName: commodities.name,
			commodityType: commodities.type,
			commodityCurrency: commodities.currency
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(commodities, eq(commodities.id, accounts.commodityId))
		.where(eq(accounts.isActive, true))
		.orderBy(accountTypes.name, accounts.name);

	return {
		txList: Array.from(txMap.values()),
		accounts: allAccounts,
		page: safePage,
		totalPages,
		total,
		filterAccountId,
		search,
		filterYear,
		filterMonth,
		availableYears
	};
};

// ---------------------------------------------------------------------------
// Shared field parser
// ---------------------------------------------------------------------------

function parseFields(data: FormData) {
	const date = data.get('date');
	const description = data.get('description');
	const notes = data.get('notes');
	const fromAccountId = data.get('fromAccountId');
	const toAccountId = data.get('toAccountId');
	const amountRaw = data.get('amount');
	const currency = data.get('currency');

	if (
		typeof date !== 'string' || !date ||
		typeof description !== 'string' || !description.trim() ||
		typeof fromAccountId !== 'string' || !fromAccountId ||
		typeof toAccountId !== 'string' || !toAccountId ||
		typeof amountRaw !== 'string' || !amountRaw ||
		typeof currency !== 'string' || !currency
	) return { error: 'All required fields must be filled in.' } as const;

	const fromId = parseInt(fromAccountId, 10);
	const toId = parseInt(toAccountId, 10);
	if (fromId === toId) return { error: '"From" and "To" accounts must be different.' } as const;

	const amountFloat = parseFloat(amountRaw.replace(',', '.'));
	if (isNaN(amountFloat) || amountFloat <= 0) return { error: 'Amount must be a positive number.' } as const;

	return {
		date,
		description: description.trim(),
		notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
		fromId,
		toId,
		amountInt: Math.round(amountFloat * 100),
		currency
	};
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const formData = await request.formData();
		const fields = parseFields(formData);
		if ('error' in fields) return fail(400, { error: fields.error });

		const quantityRaw = formData.get('quantity');
		const toAccount = db
			.select({ commodityId: accounts.commodityId })
			.from(accounts)
			.where(eq(accounts.id, fields.toId))
			.get();
		const commodityId = toAccount?.commodityId ?? null;
		const quantityInt =
			commodityId && typeof quantityRaw === 'string' && quantityRaw
				? Math.round(parseFloat(quantityRaw.replace(',', '.')) * 1000)
				: null;

		try {
			createTransaction({
				date: fields.date,
				description: fields.description,
				notes: fields.notes ?? undefined,
				entries: [
					{ accountId: fields.fromId, amount: -fields.amountInt, currency: fields.currency },
					{ accountId: fields.toId,   amount:  fields.amountInt, currency: fields.currency,
					  commodityId: commodityId ?? undefined, quantity: quantityInt ?? undefined }
				]
			});
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}

		redirect(302, '/transactions');
	},

	toggleStar: async ({ request, locals, url }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const idRaw = data.get('txId');
		if (typeof idRaw !== 'string' || !idRaw) return fail(400, { error: 'Missing transaction ID.' });
		const txId = parseInt(idRaw, 10);

		const [tx] = db.select({ isStarred: transactions.isStarred }).from(transactions).where(eq(transactions.id, txId)).all();
		if (!tx) return fail(404, { error: 'Transaction not found.' });

		db.update(transactions).set({ isStarred: !tx.isStarred }).where(eq(transactions.id, txId)).run();
		const redirectParams = new URLSearchParams();
		if (url.searchParams.has('page')) redirectParams.set('page', url.searchParams.get('page')!);
		if (url.searchParams.has('accountId')) redirectParams.set('accountId', url.searchParams.get('accountId')!);
		redirect(302, `/transactions?${redirectParams.toString()}`);
	},

	update: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const txIdRaw = data.get('txId');
		if (typeof txIdRaw !== 'string' || !txIdRaw) return fail(400, { error: 'Missing transaction ID.' });
		const txId = parseInt(txIdRaw, 10);

		const fields = parseFields(data);
		if ('error' in fields) return fail(400, { error: fields.error });

		try {
			db.transaction((tx) => {
				tx.update(transactions)
					.set({ date: fields.date, description: fields.description, notes: fields.notes, updatedAt: sql`(unixepoch())` })
					.where(eq(transactions.id, txId))
					.run();

				tx.delete(journalEntries).where(eq(journalEntries.transactionId, txId)).run();

				tx.insert(journalEntries).values([
					{ transactionId: txId, accountId: fields.fromId, amount: -fields.amountInt, currency: fields.currency },
					{ transactionId: txId, accountId: fields.toId,   amount:  fields.amountInt, currency: fields.currency }
				]).run();
			});
		} catch (e) {
			return fail(500, { error: (e as Error).message });
		}

		redirect(302, '/transactions');
	}
};
