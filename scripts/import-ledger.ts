/**
 * One-time import of main.ledger into the finance database.
 *
 * Usage: npx tsx scripts/import-ledger.ts
 *
 * Account mapping (ledger path → DB account id):
 *   Assets:Checking:N26                → 1  (N26)
 *   Assets:Checking:Revolut            → 16 (Revolut Savings)
 *   Assets:Checking:Revolut:Current    → 2  (Revolut Current)
 *   Assets:Checking:Scalable           → 15 (Scalable Capital)
 *   Assets:Home:Unaccounted            → 14 (Home Maintenance)
 *   Assets:Equity:Stocks:Nvidia        → 25 (NVIDIA)
 *   Assets:Equity:Stocks:Alphabet      → 24 (ALPHABET)
 *   Assets:Equity:ETF:SPYL             → 23 (SPYL)
 *   Assets:Equity:ETF:FWIA             → 21 (FTSE)
 *   Assets:Equity:Crypto:Bitcoin       → 26 (BITCOIN)
 *   Equity:OpeningBalance              → 13 (Checking Balance)
 *   Income:Salary:KIT                  → 11 (Salary-KIT)
 *   Income:Salary:Tür an Tür           → 12 (Salary-Tür an Tür)
 *   Expenses:Rent / Expenses:Rent:*    → 3  (Rent)
 *   Expenses:Miscellaneous / :Cash     → 4  (Miscellaneous)
 *   Expenses:Work:Travel               → 5  (Work-Travel)
 *   Expenses:Work:Stay                 → 6  (Work-Accommodation and Food)
 *   Expenses:Work:Food                 → 6  (Work-Accommodation and Food)
 *   Expenses:Trips:*                   → 7  (Trips)
 *   Expenses:Sports                    → 8  (Sports)
 *   Expenses:Essentials:*              → 9  (Groceries and Eating Out)
 *   Expenses:Restaurants:*             → 9  (Groceries and Eating Out)
 *   Expenses:Shopping / :Clothing / :Lent → 10 (Shopping)
 *   Expenses:Home:* / Expenses:Home:Setup → 14 (Home Maintenance)
 *   Expenses:Subscriptions:*           → 17 (Subscriptions)
 *   Expenses:Tax:*                     → 4  (Miscellaneous)
 *   Expenses:Insurance:*               → 4  (Miscellaneous)
 *   Expenses:Utilities                 → 4  (Miscellaneous)
 *   Expenses:Events                    → 4  (Miscellaneous)
 *   Expenses:Loan                      → 19 (Loan)
 *   Expenses:Transactions              → 28 (Transactions)
 *   Cash:*                             → 18 (Cash)
 *
 * Commodity mapping (ledger symbol → DB commodity id):
 *   NVIDIA  → 7
 *   ABC     → 9  (Alphabet)
 *   SPYL    → 5
 *   FWIA    → 3  (FTSE/FWIA)
 *   BTC     → 11 (Bitcoin)
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dbPath = resolve(process.env.DATABASE_URL ?? './data/finance.db');
const ledgerPath = resolve('./main.ledger');

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Account map: normalised ledger path → DB account id
// ---------------------------------------------------------------------------

function mapAccount(path: string): number {
	const p = path.trim().toLowerCase();

	// Assets
	if (p === 'assets:checking:n26') return 1;
	if (p === 'assets:checking:revolut:current') return 2;
	if (p === 'assets:checking:revolut') return 16;
	if (p === 'assets:checking:scalable') return 15;
	if (p === 'assets:home:unaccounted') return 14;
	if (p === 'assets:equity:stocks:nvidia') return 25;
	if (p === 'assets:equity:stocks:alphabet') return 24;
	if (p === 'assets:equity:etf:spyl') return 23;
	if (p === 'assets:equity:etf:fwia') return 21;
	if (p === 'assets:equity:crypto:bitcoin') return 26;

	// Equity
	if (p === 'equity:openingbalance') return 13;

	// Income
	if (p === 'income:salary:kit') return 11;
	if (p.startsWith('income:salary:')) return 12; // Tür an Tür and any other

	// Expenses
	if (p.startsWith('expenses:rent')) return 3;
	if (p.startsWith('expenses:work:travel')) return 5;
	if (p.startsWith('expenses:work:stay') || p.startsWith('expenses:work:food')) return 6;
	if (p.startsWith('expenses:trips:')) return 7;
	if (p === 'expenses:sports') return 8;
	if (p.startsWith('expenses:essentials:')) return 9;
	if (p.startsWith('expenses:restaurants')) return 9;
	if (p.startsWith('expenses:shopping')) return 10;
	if (p.startsWith('expenses:home:')) return 14;
	if (p.startsWith('expenses:subscriptions:')) return 17;
	if (p === 'expenses:loan') return 19;
	if (p === 'expenses:transactions') return 28;
	// everything else → Miscellaneous
	if (p.startsWith('expenses:')) return 4;

	throw new Error(`Unmapped account: "${path}"`);
}

// ---------------------------------------------------------------------------
// Commodity map: ledger symbol → DB commodity id
// ---------------------------------------------------------------------------

function mapCommodity(symbol: string): number | null {
	switch (symbol.toUpperCase()) {
		case 'NVIDIA': return 7;
		case 'ABC':    return 9;  // Alphabet
		case 'SPYL':   return 5;
		case 'FWIA':   return 3;
		case 'BTC':    return 11;
		default:       return null;
	}
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

type RawEntry = {
	account: string;
	amount: number | null;     // in cents (EUR), null means "auto-balance"
	currency: string;
	commodity: string | null;  // commodity symbol if present
	quantity: number | null;   // commodity units * 1000 (milli-units)
	unitPrice: number | null;  // price per unit in cents
};

type RawTransaction = {
	date: string;
	description: string;
	entries: RawEntry[];
};

function parseAmount(raw: string): { amount: number; currency: string } {
	// Normalise German decimal comma → dot
	const s = raw.trim().replace(',', '.');
	// Extract currency (letters) and number
	const match = s.match(/^([A-Z]+)?\s*([\d.]+)\s*([A-Z]+)?$/i);
	if (!match) throw new Error(`Cannot parse amount: "${raw}"`);
	const currency = (match[1] ?? match[3] ?? 'EUR').toUpperCase();
	const value = parseFloat(match[2]);
	// Store in cents (integer)
	return { amount: Math.round(value * 100), currency };
}

function parseLedger(text: string): RawTransaction[] {
	const txs: RawTransaction[] = [];
	// Split on blank lines, keep blocks that start with a date
	const blocks = text.split(/\n\s*\n/);

	for (const block of blocks) {
		const lines = block.split('\n').map((l) => l.replace(/\t/g, '    '));
		const headerMatch = lines[0]?.match(/^(\d{4}\/\d{2}\/\d{2})\s+(.+)$/);
		if (!headerMatch) continue;

		const date = headerMatch[1].replace(/\//g, '-');
		const description = headerMatch[2].trim();
		const entries: RawEntry[] = [];

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i];
			// Skip comment/directive lines and blank lines
			if (!line || /^\s*[;#]/.test(line) || /^\s*=/.test(line)) continue;
			// Must be indented (posting line)
			if (!/^\s+/.test(line)) continue;

			const posting = line.trim();
			if (!posting) continue;

			// Check for commodity purchase:  AccountPath   QTY SYMBOL @ PRICE CURRENCY
			const commodityMatch = posting.match(
				/^(.+?)\s{2,}([\d.,]+)\s+([A-Z]+)\s+@\s+([\d.,]+)\s*(EUR|INR|USD)?$/i
			);
			if (commodityMatch) {
				const account = commodityMatch[1].trim();
				const qty = parseFloat(commodityMatch[2].replace(',', '.'));
				const symbol = commodityMatch[3].toUpperCase();
				const price = parseFloat(commodityMatch[4].replace(',', '.'));
				entries.push({
					account,
					amount: null, // will be computed as qty * price
					currency: (commodityMatch[5] ?? 'EUR').toUpperCase(),
					commodity: symbol,
					quantity: Math.round(qty * 1000),
					unitPrice: Math.round(price * 100)
				});
				continue;
			}

			// Normal posting: AccountPath   [AMOUNT CURRENCY]
			// Amount may be missing (auto-balance leg)
			const normalMatch = posting.match(/^(.+?)\s{2,}(.*)?$/);
			if (normalMatch) {
				const account = normalMatch[1].trim();
				const amountStr = normalMatch[2]?.trim() ?? '';
				if (!amountStr) {
					entries.push({ account, amount: null, currency: 'EUR', commodity: null, quantity: null, unitPrice: null });
				} else {
					const { amount, currency } = parseAmount(amountStr);
					entries.push({ account, amount, currency, commodity: null, quantity: null, unitPrice: null });
				}
			} else {
				// Only account name, no amount → auto-balance
				const account = posting.trim();
				if (account) {
					entries.push({ account, amount: null, currency: 'EUR', commodity: null, quantity: null, unitPrice: null });
				}
			}
		}

		if (entries.length > 0) {
			txs.push({ date, description, entries });
		}
	}

	return txs;
}

// ---------------------------------------------------------------------------
// Auto-balance: fill in the missing leg (ledger convention: one entry may
// omit its amount and receive the negated sum of all others).
// ---------------------------------------------------------------------------

function autoBalance(entries: RawEntry[]): void {
	const nullEntries = entries.filter((e) => e.amount === null);
	if (nullEntries.length === 0) return;
	if (nullEntries.length > 1) {
		throw new Error('Multiple auto-balance legs in one transaction');
	}

	// Sum all explicit amounts per currency
	const sums = new Map<string, number>();
	for (const e of entries) {
		if (e.amount !== null) {
			sums.set(e.currency, (sums.get(e.currency) ?? 0) + e.amount);
		} else if (e.commodity) {
			// commodity entry with null fiat amount: compute from qty * unitPrice
			const val = Math.round((e.quantity! / 1000) * e.unitPrice!);
			sums.set(e.currency, (sums.get(e.currency) ?? 0) + val);
		}
	}

	const leg = nullEntries[0];
	// The auto-balance leg takes the negated sum of the dominant currency
	// (for commodity txs the fiat side is the only currency that matters)
	const dominantCurrency = sums.size === 1 ? [...sums.keys()][0] : 'EUR';
	leg.currency = dominantCurrency;
	leg.amount = -(sums.get(dominantCurrency) ?? 0);
}

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

const insertTx = sqlite.prepare(
	`INSERT INTO transactions (date, description) VALUES (?, ?) RETURNING id`
);

const insertEntry = sqlite.prepare(
	`INSERT INTO journal_entries (transaction_id, account_id, amount, currency, commodity_id, quantity)
	 VALUES (?, ?, ?, ?, ?, ?)`
);

const insertPrice = sqlite.prepare(
	`INSERT OR IGNORE INTO prices (commodity_id, date, price, currency) VALUES (?, ?, ?, ?)`
);

function importTransaction(tx: RawTransaction): void {
	autoBalance(tx.entries);

	const { id: txId } = insertTx.get(tx.date, tx.description) as { id: number };

	for (const e of tx.entries) {
		const accountId = mapAccount(e.account);
		const commodityId = e.commodity ? mapCommodity(e.commodity) : null;

		let amount = e.amount;
		if (amount === null && e.commodity) {
			// commodity purchase: fiat amount is qty * unitPrice (already balanced above)
			amount = -Math.round((e.quantity! / 1000) * e.unitPrice!);
		}

		insertEntry.run(txId, accountId, amount!, e.currency, commodityId, e.quantity);

		// Record unit price in prices table for commodity entries
		if (commodityId && e.unitPrice !== null) {
			insertPrice.run(commodityId, tx.date, e.unitPrice, e.currency);
		}
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ledgerText = readFileSync(ledgerPath, 'utf-8');
const parsed = parseLedger(ledgerText);

console.log(`Parsed ${parsed.length} transactions from ledger.`);

let imported = 0;
let failed = 0;

const run = sqlite.transaction(() => {
	for (const tx of parsed) {
		try {
			importTransaction(tx);
			imported++;
		} catch (err) {
			console.error(`  SKIP [${tx.date}] "${tx.description}": ${(err as Error).message}`);
			failed++;
		}
	}
});

run();

console.log(`\nDone. Imported: ${imported}, Skipped: ${failed}`);
sqlite.close();
