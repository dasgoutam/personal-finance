import { db } from './db';
import { transactions, journalEntries } from './db/schema';
import type { NewJournalEntry } from './db/schema';

export interface JournalEntryInput {
	accountId: number;
	/** Amount in smallest currency unit (cents for EUR, paise for INR).
	 *  Positive = debit, negative = credit. */
	amount: number;
	currency: string;
	commodityId?: number;
	/** Quantity in milli-units (1000 = 1 share/unit). */
	quantity?: number;
}

export interface TransactionInput {
	date: string;
	description: string;
	notes?: string;
	entries: JournalEntryInput[];
}

/**
 * Creates a balanced double-entry transaction.
 *
 * Validation: for every currency present in the entries, the sum of amounts
 * must equal zero. Throws if the transaction is unbalanced or has fewer than
 * two legs.
 *
 * The insert is wrapped in a SQLite transaction so it is all-or-nothing.
 */
export function createTransaction(input: TransactionInput) {
	if (input.entries.length < 2) {
		throw new Error('A transaction requires at least two journal entries.');
	}

	// Validate double-entry balance per currency
	const sumByCurrency = new Map<string, number>();
	for (const entry of input.entries) {
		sumByCurrency.set(
			entry.currency,
			(sumByCurrency.get(entry.currency) ?? 0) + entry.amount
		);
	}
	for (const [currency, sum] of sumByCurrency) {
		if (sum !== 0) {
			throw new Error(
				`Journal entries for ${currency} are unbalanced: net sum is ${sum} (must be 0).`
			);
		}
	}

	return db.transaction((tx) => {
		const [newTx] = tx
			.insert(transactions)
			.values({
				date: input.date,
				description: input.description,
				notes: input.notes
			})
			.returning()
			.all();

		const entryValues: NewJournalEntry[] = input.entries.map((e) => ({
			transactionId: newTx.id,
			accountId: e.accountId,
			amount: e.amount,
			currency: e.currency,
			commodityId: e.commodityId,
			quantity: e.quantity
		}));

		tx.insert(journalEntries).values(entryValues).run();

		return newTx;
	});
}
