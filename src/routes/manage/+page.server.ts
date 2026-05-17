import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { accounts, accountTypes, commodities, journalEntries, transactions, COMMODITY_TYPES } from '$lib/server/db/schema';
import { parseLedger } from '$lib/server/ledger-parser';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	const allAccountTypes = await db
		.select()
		.from(accountTypes)
		.orderBy(accountTypes.category, accountTypes.name);

	const allAccounts = await db
		.select({
			id: accounts.id,
			name: accounts.name,
			accountTypeId: accounts.accountTypeId,
			accountTypeName: accountTypes.name,
			accountTypeCategory: accountTypes.category,
			currency: accounts.currency,
			commodityId: accounts.commodityId,
			commoditySymbol: commodities.symbol,
			description: accounts.description,
			isActive: accounts.isActive
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(commodities, eq(commodities.id, accounts.commodityId))
		.orderBy(accountTypes.name, accounts.name);

	const allCommodities = await db
		.select()
		.from(commodities)
		.orderBy(commodities.symbol);

	return { accountTypes: allAccountTypes, accounts: allAccounts, commodities: allCommodities };
};

export const actions: Actions = {
	// ── Account Types ────────────────────────────────────────────────────────

	addAccountType: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const name = data.get('name');
		const category = data.get('category');
		const parentIdRaw = data.get('parentId');

		if (typeof name !== 'string' || !name.trim())
			return fail(400, { error: 'Name is required.', tab: 'account-types' });
		if (typeof category !== 'string' || !['asset', 'liability', 'income', 'expense', 'equity'].includes(category))
			return fail(400, { error: 'Invalid category.', tab: 'account-types' });

		const parentId =
			typeof parentIdRaw === 'string' && parentIdRaw !== ''
				? parseInt(parentIdRaw, 10)
				: null;

		try {
			db.insert(accountTypes).values({ name: name.trim(), category: category as any, parentId }).run();
		} catch (e) {
			return fail(500, { error: (e as Error).message, tab: 'account-types' });
		}

		redirect(302, '/manage?tab=account-types');
	},

	deleteAccountType: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const idRaw = data.get('id');
		if (typeof idRaw !== 'string' || !idRaw)
			return fail(400, { error: 'Missing type ID.', tab: 'account-types' });
		const id = parseInt(idRaw, 10);

		const [type] = db.select().from(accountTypes).where(eq(accountTypes.id, id)).all();
		if (!type) return fail(404, { error: 'Account type not found.', tab: 'account-types' });
		if (type.isDefault) return fail(400, { error: 'Default account types cannot be deleted.', tab: 'account-types' });

		const inUse = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.accountTypeId, id)).limit(1).all();
		if (inUse.length > 0) return fail(400, { error: 'This type is in use by one or more accounts.', tab: 'account-types' });

		db.delete(accountTypes).where(eq(accountTypes.id, id)).run();
		redirect(302, '/manage?tab=account-types');
	},

	// ── Accounts ─────────────────────────────────────────────────────────────

	addAccount: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const name = data.get('name');
		const accountTypeIdRaw = data.get('accountTypeId');
		const currency = data.get('currency');
		const description = data.get('description');
		const commodityIdRaw = data.get('commodityId');

		if (typeof name !== 'string' || !name.trim())
			return fail(400, { error: 'Name is required.', tab: 'accounts' });
		if (typeof accountTypeIdRaw !== 'string' || !accountTypeIdRaw)
			return fail(400, { error: 'Account type is required.', tab: 'accounts' });
		if (typeof currency !== 'string' || !currency.trim())
			return fail(400, { error: 'Currency is required.', tab: 'accounts' });

		const accountTypeId = parseInt(accountTypeIdRaw, 10);
		const commodityId =
			typeof commodityIdRaw === 'string' && commodityIdRaw
				? parseInt(commodityIdRaw, 10)
				: null;

		try {
			db.insert(accounts).values({
				name: name.trim(),
				accountTypeId,
				currency: currency.trim().toUpperCase(),
				commodityId,
				description: typeof description === 'string' && description.trim() ? description.trim() : null
			}).run();
		} catch (e) {
			return fail(500, { error: (e as Error).message, tab: 'accounts' });
		}

		redirect(302, '/manage?tab=accounts');
	},

	deleteAccount: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const idRaw = data.get('id');
		if (typeof idRaw !== 'string' || !idRaw)
			return fail(400, { error: 'Missing account ID.', tab: 'accounts' });
		const id = parseInt(idRaw, 10);

		const entries = db.select({ id: journalEntries.id }).from(journalEntries)
			.where(eq(journalEntries.accountId, id)).limit(1).all();

		if (entries.length > 0) {
			db.update(accounts).set({ isActive: false }).where(eq(accounts.id, id)).run();
		} else {
			db.delete(accounts).where(eq(accounts.id, id)).run();
		}

		redirect(302, '/manage?tab=accounts');
	},

	renameAccount: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const idRaw = data.get('id');
		const name = data.get('name');

		if (typeof idRaw !== 'string' || !idRaw)
			return fail(400, { error: 'Missing account ID.', tab: 'accounts' });
		if (typeof name !== 'string' || !name.trim())
			return fail(400, { error: 'Name is required.', tab: 'accounts' });

		db.update(accounts).set({ name: name.trim() }).where(eq(accounts.id, parseInt(idRaw, 10))).run();
		redirect(302, '/manage?tab=accounts');
	},

	reactivateAccount: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const idRaw = data.get('id');
		if (typeof idRaw !== 'string' || !idRaw)
			return fail(400, { error: 'Missing account ID.', tab: 'accounts' });
		const id = parseInt(idRaw, 10);

		db.update(accounts).set({ isActive: true }).where(eq(accounts.id, id)).run();
		redirect(302, '/manage?tab=accounts');
	},

	// ── Commodities ──────────────────────────────────────────────────────────

	addCommodity: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const symbol = data.get('symbol');
		const name = data.get('name');
		const currency = data.get('currency');
		const type = data.get('type');

		if (typeof symbol !== 'string' || !symbol.trim())
			return fail(400, { error: 'Symbol is required.', tab: 'commodities' });
		if (typeof name !== 'string' || !name.trim())
			return fail(400, { error: 'Name is required.', tab: 'commodities' });
		if (typeof currency !== 'string' || !currency.trim())
			return fail(400, { error: 'Currency is required.', tab: 'commodities' });
		if (typeof type !== 'string' || !(COMMODITY_TYPES as readonly string[]).includes(type))
			return fail(400, { error: 'Invalid type.', tab: 'commodities' });

		try {
			db.insert(commodities).values({
				symbol: symbol.trim().toUpperCase(),
				name: name.trim(),
				currency: currency.trim().toUpperCase(),
				type: type as typeof COMMODITY_TYPES[number]
			}).run();
		} catch (e) {
			return fail(500, { error: (e as Error).message, tab: 'commodities' });
		}

		redirect(302, '/manage?tab=commodities');
	},

	deleteCommodity: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const idRaw = data.get('id');
		if (typeof idRaw !== 'string' || !idRaw)
			return fail(400, { error: 'Missing commodity ID.', tab: 'commodities' });
		const id = parseInt(idRaw, 10);

		const entries = db.select({ id: journalEntries.id }).from(journalEntries)
			.where(eq(journalEntries.commodityId, id)).limit(1).all();

		if (entries.length > 0)
			return fail(400, { error: 'Cannot delete a commodity that has journal entries.', tab: 'commodities' });

		db.delete(commodities).where(eq(commodities.id, id)).run();
		redirect(302, '/manage?tab=commodities');
	},

	// ── Import ───────────────────────────────────────────────────────────────

	importLedger: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');

		const data = await request.formData();
		const file = data.get('file') as File | null;

		if (!file || file.size === 0)
			return fail(400, { error: 'No file selected.', tab: 'import' });

		let content: string;
		try {
			content = await file.text();
		} catch {
			return fail(400, { error: 'Could not read file.', tab: 'import' });
		}

		const parsed = parseLedger(content);

		let accountsCreated = 0;
		let commoditiesCreated = 0;
		let transactionsImported = 0;

		try {
			db.transaction((tx) => {
				// Build type name → id map from existing account types
				const existingTypes = tx.select({ id: accountTypes.id, name: accountTypes.name })
					.from(accountTypes).all();
				const typeNameToId = new Map(existingTypes.map((t) => [t.name, t.id]));

				// --- 1. Insert accounts (flat, no hierarchy) ---
				const existingAccounts = tx
					.select({ id: accounts.id, name: accounts.name, accountTypeId: accounts.accountTypeId })
					.from(accounts).all();

				const pathToId = new Map<string, number>();

				for (const parsedAccount of parsed.accounts.values()) {
					const accountTypeId = typeNameToId.get(parsedAccount.accountTypeName);
					if (!accountTypeId) {
						parsed.warnings.push(`Unknown account type "${parsedAccount.accountTypeName}" for "${parsedAccount.path}", skipping.`);
						continue;
					}

					const existing = existingAccounts.find(
						(a) => a.name === parsedAccount.name && a.accountTypeId === accountTypeId
					);

					if (existing) {
						pathToId.set(parsedAccount.path, existing.id);
					} else {
						const [inserted] = tx.insert(accounts).values({
							name: parsedAccount.name,
							accountTypeId,
							currency: 'EUR'
						}).returning().all();
						existingAccounts.push({ id: inserted.id, name: inserted.name, accountTypeId: inserted.accountTypeId });
						pathToId.set(parsedAccount.path, inserted.id);
						accountsCreated++;
					}
				}

				// --- 2. Insert commodities ---
				const symbolToId = new Map<string, number>();

				for (const [symbol, info] of parsed.commodities) {
					const existing = tx.select({ id: commodities.id }).from(commodities)
						.where(eq(commodities.symbol, symbol)).all();

					if (existing.length > 0) {
						symbolToId.set(symbol, existing[0].id);
					} else {
						const [inserted] = tx.insert(commodities).values({
							symbol: info.symbol,
							name: info.symbol,
							currency: info.currency
						}).returning().all();
						symbolToId.set(symbol, inserted.id);
						commoditiesCreated++;
					}
				}

				// --- 3. Insert transactions and journal entries ---
				for (const parsedTx of parsed.transactions) {
					const missingPath = parsedTx.postings.find((p) => !pathToId.has(p.accountPath));
					if (missingPath) {
						parsed.warnings.push(`Transaction on ${parsedTx.date} "${parsedTx.description}": account "${missingPath.accountPath}" not resolved, skipping.`);
						continue;
					}

					const [newTx] = tx.insert(transactions).values({
						date: parsedTx.date,
						description: parsedTx.description
					}).returning().all();

					tx.insert(journalEntries).values(
						parsedTx.postings.map((p) => ({
							transactionId: newTx.id,
							accountId: pathToId.get(p.accountPath)!,
							amount: p.amount!,
							currency: p.currency,
							commodityId: p.commoditySymbol ? (symbolToId.get(p.commoditySymbol) ?? null) : null,
							quantity: p.quantity ?? null
						}))
					).run();

					transactionsImported++;
				}
			});
		} catch (e) {
			return fail(500, { error: (e as Error).message, tab: 'import' });
		}

		return {
			importResult: { accountsCreated, commoditiesCreated, transactionsImported, warnings: parsed.warnings },
			tab: 'import'
		};
	}
};
