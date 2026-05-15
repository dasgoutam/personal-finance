import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { accounts, accountTypes, commodities } from '$lib/server/db/schema';
import { createTransaction } from '$lib/server/finance';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const allAccounts = await db
		.select({
			id: accounts.id,
			name: accounts.name,
			typeName: accountTypes.name,
			currency: accounts.currency
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.where(eq(accounts.isActive, true))
		.orderBy(accountTypes.name, accounts.name);

	const allCommodities = await db
		.select()
		.from(commodities)
		.orderBy(commodities.symbol);

	return { accounts: allAccounts, commodities: allCommodities };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();

		const date = data.get('date');
		const description = data.get('description');
		const notes = data.get('notes');
		const fromAccountId = data.get('fromAccountId');
		const toAccountId = data.get('toAccountId');
		const amountRaw = data.get('amount');
		const currency = data.get('currency');
		const commodityIdRaw = data.get('commodityId');
		const quantityRaw = data.get('quantity');

		// Basic validation
		if (
			typeof date !== 'string' ||
			typeof description !== 'string' ||
			typeof fromAccountId !== 'string' ||
			typeof toAccountId !== 'string' ||
			typeof amountRaw !== 'string' ||
			typeof currency !== 'string' ||
			!date ||
			!description.trim() ||
			!fromAccountId ||
			!toAccountId ||
			!amountRaw ||
			!currency
		) {
			return fail(400, { error: 'All required fields must be filled in.', description: typeof description === 'string' ? description : '', notes: typeof notes === 'string' ? notes : '' });
		}

		const fromId = parseInt(fromAccountId, 10);
		const toId = parseInt(toAccountId, 10);

		if (fromId === toId) {
			return fail(400, { error: '"From" and "To" accounts must be different.', description: description.trim(), notes: typeof notes === 'string' ? notes : '' });
		}

		// Parse amount: user enters decimal (e.g. 87.50), store as integer cents/paise
		const amountFloat = parseFloat(amountRaw.replace(',', '.'));
		if (isNaN(amountFloat) || amountFloat <= 0) {
			return fail(400, { error: 'Amount must be a positive number.', description: description.trim(), notes: typeof notes === 'string' ? notes : '' });
		}

		// Round to avoid floating-point drift (e.g. 87.50 → 8750)
		const amountInt = Math.round(amountFloat * 100);

		// Optional commodity / quantity for investment transactions
		const commodityId =
			typeof commodityIdRaw === 'string' && commodityIdRaw
				? parseInt(commodityIdRaw, 10)
				: null;
		const quantityInt =
			commodityId && typeof quantityRaw === 'string' && quantityRaw
				? Math.round(parseFloat(quantityRaw.replace(',', '.')) * 1000)
				: null;

		try {
			createTransaction({
				date,
				description: description.trim(),
				notes: typeof notes === 'string' && notes.trim() ? notes.trim() : undefined,
				entries: [
					{ accountId: fromId, amount: -amountInt, currency },
					{ accountId: toId, amount: amountInt, currency, commodityId: commodityId ?? undefined, quantity: quantityInt ?? undefined }
				]
			});
		} catch (e) {
			return fail(400, { error: (e as Error).message, description: description.trim(), notes: typeof notes === 'string' ? notes : '' });
		}

		redirect(302, '/dashboard');
	}
};
