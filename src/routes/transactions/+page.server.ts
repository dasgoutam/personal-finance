import { fail, redirect } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { accounts, accountTypes, journalEntries, transactions } from '$lib/server/db/schema';
import { createTransaction } from '$lib/server/finance';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const rows = await db
		.select({
			txId: transactions.id,
			txDate: transactions.date,
			txDescription: transactions.description,
			txNotes: transactions.notes,
			jeId: journalEntries.id,
			jeAmount: journalEntries.amount,
			jeCurrency: journalEntries.currency,
			acctId: accounts.id,
			acctName: accounts.name
		})
		.from(transactions)
		.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
		.leftJoin(accounts, eq(accounts.id, journalEntries.accountId))
		.orderBy(desc(transactions.date), desc(transactions.id));

	const txMap = new Map<
		number,
		{
			id: number;
			date: string;
			description: string;
			notes: string | null;
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
			typeCategory: accountTypes.category
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.where(eq(accounts.isActive, true))
		.orderBy(accountTypes.name, accounts.name);

	return { txList: Array.from(txMap.values()), accounts: allAccounts };
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

		const fields = parseFields(await request.formData());
		if ('error' in fields) return fail(400, { error: fields.error });

		try {
			createTransaction({
				date: fields.date,
				description: fields.description,
				notes: fields.notes ?? undefined,
				entries: [
					{ accountId: fields.fromId, amount: -fields.amountInt, currency: fields.currency },
					{ accountId: fields.toId,   amount:  fields.amountInt, currency: fields.currency }
				]
			});
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}

		redirect(302, '/transactions');
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
