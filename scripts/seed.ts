/**
 * Seeds the database with:
 *   - A single admin user
 *   - A full chart of accounts for someone living in Germany (EUR primary, INR secondary)
 *   - Sample commodities (Indian ETFs / mutual funds)
 *   - Historical price data
 *   - ~20 sample double-entry transactions spanning 2024-2025
 *
 * Usage: npm run db:seed
 *
 * Environment variables:
 *   DATABASE_URL       Path to SQLite file (default: ./data/finance.db)
 *   FINANCE_USERNAME   Admin username       (default: admin)
 *   FINANCE_PASSWORD   Admin password       (default: changeme)
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { hash } from '@node-rs/argon2';
import { generateId } from 'lucia';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import * as schema from '../src/lib/server/db/schema.js';

// ---------------------------------------------------------------------------
// Database bootstrap
// ---------------------------------------------------------------------------

const dbPath = resolve(process.env.DATABASE_URL ?? './data/finance.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });

// Apply any pending migrations before seeding
migrate(db, { migrationsFolder: './drizzle/migrations' });

// ---------------------------------------------------------------------------
// Helper: insert a balanced transaction (validates double-entry constraint)
// ---------------------------------------------------------------------------

type EntryInput = {
	accountId: number;
	amount: number;
	currency: string;
	commodityId?: number;
	quantity?: number;
};

function insertTx(
	date: string,
	description: string,
	entries: EntryInput[],
	notes?: string
): void {
	// Validate balance per currency
	const sums = new Map<string, number>();
	for (const e of entries) {
		sums.set(e.currency, (sums.get(e.currency) ?? 0) + e.amount);
	}
	for (const [cur, sum] of sums) {
		if (sum !== 0) {
			throw new Error(`Unbalanced transaction "${description}" [${cur}]: net = ${sum}`);
		}
	}

	const [tx] = db
		.insert(schema.transactions)
		.values({ date, description, notes })
		.returning()
		.all();

	db.insert(schema.journalEntries)
		.values(entries.map((e) => ({ transactionId: tx.id, ...e })))
		.run();
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
	console.log('Starting seed…');

	// ---- User ---------------------------------------------------------------
	const username = process.env.FINANCE_USERNAME ?? 'admin';
	const password = process.env.FINANCE_PASSWORD ?? 'changeme';

	const hashedPassword = await hash(password, {
		memoryCost: 19456,
		timeCost: 2,
		outputLen: 32,
		parallelism: 1
	});

	db.insert(schema.users)
		.values({ id: generateId(15), username, hashedPassword })
		.onConflictDoNothing()
		.run();

	console.log(`  User "${username}" created (password: ${password})`);

	// ---- Accounts -----------------------------------------------------------
	// Root accounts (no parent)
	const [assets] = db
		.insert(schema.accounts)
		.values({ name: 'Assets', type: 'asset', currency: 'EUR' })
		.returning()
		.all();
	const [liabilities] = db
		.insert(schema.accounts)
		.values({ name: 'Liabilities', type: 'liability', currency: 'EUR' })
		.returning()
		.all();
	const [equity] = db
		.insert(schema.accounts)
		.values({ name: 'Equity', type: 'equity', currency: 'EUR' })
		.returning()
		.all();
	const [income] = db
		.insert(schema.accounts)
		.values({ name: 'Income', type: 'income', currency: 'EUR' })
		.returning()
		.all();
	const [expenses] = db
		.insert(schema.accounts)
		.values({ name: 'Expenses', type: 'expense', currency: 'EUR' })
		.returning()
		.all();

	// Assets — EUR
	const [dkbChecking] = db
		.insert(schema.accounts)
		.values({
			name: 'DKB Girokonto',
			parentId: assets.id,
			type: 'asset',
			currency: 'EUR',
			description: 'DKB Bank checking account'
		})
		.returning()
		.all();
	const [tagesgeld] = db
		.insert(schema.accounts)
		.values({
			name: 'DKB Tagesgeld',
			parentId: assets.id,
			type: 'asset',
			currency: 'EUR',
			description: 'DKB savings account'
		})
		.returning()
		.all();
	const [cash] = db
		.insert(schema.accounts)
		.values({
			name: 'Bargeld',
			parentId: assets.id,
			type: 'asset',
			currency: 'EUR',
			description: 'Physical cash (EUR)'
		})
		.returning()
		.all();

	// Assets — INR (Indian investments)
	const [indianInvestments] = db
		.insert(schema.accounts)
		.values({
			name: 'Indian Investments',
			parentId: assets.id,
			type: 'asset',
			currency: 'INR',
			description: 'Investments held in India'
		})
		.returning()
		.all();
	const [zerodha] = db
		.insert(schema.accounts)
		.values({
			name: 'Zerodha Portfolio',
			parentId: indianInvestments.id,
			type: 'asset',
			currency: 'INR',
			description: 'Zerodha demat account — equities & ETFs'
		})
		.returning()
		.all();
	const [ppf] = db
		.insert(schema.accounts)
		.values({
			name: 'PPF Account',
			parentId: indianInvestments.id,
			type: 'asset',
			currency: 'INR',
			description: 'Public Provident Fund'
		})
		.returning()
		.all();
	const [nreAccount] = db
		.insert(schema.accounts)
		.values({
			name: 'NRE Savings Account',
			parentId: indianInvestments.id,
			type: 'asset',
			currency: 'INR',
			description: 'Non-Resident External (NRE) savings account'
		})
		.returning()
		.all();

	// Liabilities
	const [visaCard] = db
		.insert(schema.accounts)
		.values({
			name: 'Visa Kreditkarte',
			parentId: liabilities.id,
			type: 'liability',
			currency: 'EUR',
			description: 'DKB Visa credit card'
		})
		.returning()
		.all();

	// Equity
	const [openingEUR] = db
		.insert(schema.accounts)
		.values({
			name: 'Opening Balance Equity',
			parentId: equity.id,
			type: 'equity',
			currency: 'EUR',
			description: 'Initial EUR balances'
		})
		.returning()
		.all();
	const [openingINR] = db
		.insert(schema.accounts)
		.values({
			name: 'Opening Balance Equity (INR)',
			parentId: equity.id,
			type: 'equity',
			currency: 'INR',
			description: 'Initial INR balances'
		})
		.returning()
		.all();
	// Bridge accounts used when converting EUR ↔ INR.
	// One leg in each currency so both currency groups balance independently.
	const [fxBridgeEUR] = db
		.insert(schema.accounts)
		.values({
			name: 'Currency Exchange Bridge (EUR)',
			parentId: equity.id,
			type: 'equity',
			currency: 'EUR',
			description: 'Contra account for the EUR side of a cross-currency transfer'
		})
		.returning()
		.all();
	const [fxBridgeINR] = db
		.insert(schema.accounts)
		.values({
			name: 'Currency Exchange Bridge (INR)',
			parentId: equity.id,
			type: 'equity',
			currency: 'INR',
			description: 'Contra account for the INR side of a cross-currency transfer'
		})
		.returning()
		.all();

	// Income
	const [salary] = db
		.insert(schema.accounts)
		.values({
			name: 'Gehalt',
			parentId: income.id,
			type: 'income',
			currency: 'EUR',
			description: 'Monthly net salary'
		})
		.returning()
		.all();
	const [freelance] = db
		.insert(schema.accounts)
		.values({
			name: 'Freiberufliche Einnahmen',
			parentId: income.id,
			type: 'income',
			currency: 'EUR',
			description: 'Freelance / consulting income'
		})
		.returning()
		.all();
	const [dividendEUR] = db
		.insert(schema.accounts)
		.values({
			name: 'Dividenden',
			parentId: income.id,
			type: 'income',
			currency: 'EUR',
			description: 'Dividend and distribution income (EUR)'
		})
		.returning()
		.all();
	const [investmentReturnsINR] = db
		.insert(schema.accounts)
		.values({
			name: 'Investment Returns (INR)',
			parentId: income.id,
			type: 'income',
			currency: 'INR',
			description: 'Realized gains and interest from Indian investments'
		})
		.returning()
		.all();

	// Expenses — housing
	const [housing] = db
		.insert(schema.accounts)
		.values({ name: 'Wohnen', parentId: expenses.id, type: 'expense', currency: 'EUR' })
		.returning()
		.all();
	const [rent] = db
		.insert(schema.accounts)
		.values({
			name: 'Miete',
			parentId: housing.id,
			type: 'expense',
			currency: 'EUR',
			description: 'Monthly rent (Kaltmiete + Nebenkosten)'
		})
		.returning()
		.all();
	const [utilities] = db
		.insert(schema.accounts)
		.values({
			name: 'Strom & Internet',
			parentId: housing.id,
			type: 'expense',
			currency: 'EUR',
			description: 'Electricity, gas, broadband'
		})
		.returning()
		.all();

	// Expenses — food
	const [food] = db
		.insert(schema.accounts)
		.values({
			name: 'Lebensmittel',
			parentId: expenses.id,
			type: 'expense',
			currency: 'EUR',
			description: 'Groceries and supermarket shopping'
		})
		.returning()
		.all();
	const [restaurants] = db
		.insert(schema.accounts)
		.values({
			name: 'Restaurant & Takeaway',
			parentId: expenses.id,
			type: 'expense',
			currency: 'EUR'
		})
		.returning()
		.all();

	// Expenses — transport
	const [transport] = db
		.insert(schema.accounts)
		.values({ name: 'Verkehr', parentId: expenses.id, type: 'expense', currency: 'EUR' })
		.returning()
		.all();
	const [publicTransport] = db
		.insert(schema.accounts)
		.values({
			name: 'ÖPNV / Deutschlandticket',
			parentId: transport.id,
			type: 'expense',
			currency: 'EUR'
		})
		.returning()
		.all();

	// Expenses — misc
	const [healthcare] = db
		.insert(schema.accounts)
		.values({
			name: 'Gesundheit',
			parentId: expenses.id,
			type: 'expense',
			currency: 'EUR',
			description: 'Doctor visits, pharmacy'
		})
		.returning()
		.all();
	const [entertainment] = db
		.insert(schema.accounts)
		.values({
			name: 'Freizeit & Unterhaltung',
			parentId: expenses.id,
			type: 'expense',
			currency: 'EUR',
			description: 'Streaming, hobbies, sports'
		})
		.returning()
		.all();
	const [clothing] = db
		.insert(schema.accounts)
		.values({ name: 'Kleidung', parentId: expenses.id, type: 'expense', currency: 'EUR' })
		.returning()
		.all();
	const [transferFees] = db
		.insert(schema.accounts)
		.values({
			name: 'Transfergebühren',
			parentId: expenses.id,
			type: 'expense',
			currency: 'EUR',
			description: 'Wire transfer and currency-exchange fees'
		})
		.returning()
		.all();

	console.log('  Accounts created.');

	// ---- Commodities --------------------------------------------------------
	const [niftyBees] = db
		.insert(schema.commodities)
		.values({ symbol: 'NIFTYBEES', name: 'Nippon India ETF Nifty BeES', currency: 'INR' })
		.returning()
		.all();
	const [hdfcFlexi] = db
		.insert(schema.commodities)
		.values({
			symbol: 'HDFCMF-FLEXI',
			name: 'HDFC Flexi Cap Fund — Direct Plan',
			currency: 'INR'
		})
		.returning()
		.all();
	const [infy] = db
		.insert(schema.commodities)
		.values({ symbol: 'INFY', name: 'Infosys Limited', currency: 'INR' })
		.returning()
		.all();

	console.log('  Commodities created.');

	// ---- Prices (in paise — 1 INR = 100 paise) ------------------------------
	db.insert(schema.prices)
		.values([
			// NIFTYBEES
			{ commodityId: niftyBees.id, date: '2024-01-01', price: 24500, currency: 'INR' }, // ₹245.00
			{ commodityId: niftyBees.id, date: '2024-06-01', price: 27800, currency: 'INR' }, // ₹278.00
			{ commodityId: niftyBees.id, date: '2025-01-01', price: 25100, currency: 'INR' }, // ₹251.00
			// HDFC Flexi Cap NAV
			{ commodityId: hdfcFlexi.id, date: '2024-01-01', price: 120000, currency: 'INR' }, // ₹1200.00
			{ commodityId: hdfcFlexi.id, date: '2024-06-01', price: 138000, currency: 'INR' }, // ₹1380.00
			{ commodityId: hdfcFlexi.id, date: '2025-01-01', price: 128000, currency: 'INR' }, // ₹1280.00
			// INFY
			{ commodityId: infy.id, date: '2024-01-01', price: 147500, currency: 'INR' }, // ₹1475.00
			{ commodityId: infy.id, date: '2025-01-01', price: 191000, currency: 'INR' } // ₹1910.00
		])
		.run();

	console.log('  Prices created.');

	// ---- Transactions -------------------------------------------------------
	// Opening balances — 2024-01-01
	insertTx(
		'2024-01-01',
		'Opening Balance — EUR accounts',
		[
			{ accountId: dkbChecking.id, amount: 350000, currency: 'EUR' }, // €3 500
			{ accountId: tagesgeld.id, amount: 800000, currency: 'EUR' }, // €8 000
			{ accountId: cash.id, amount: 20000, currency: 'EUR' }, // €200
			{ accountId: openingEUR.id, amount: -1170000, currency: 'EUR' } // -€11 700
		],
		'Initial EUR account balances as of 2024-01-01'
	);

	insertTx(
		'2024-01-01',
		'Opening Balance — INR accounts',
		[
			{ accountId: zerodha.id, amount: 25000000, currency: 'INR' }, // ₹2 50 000
			{ accountId: ppf.id, amount: 50000000, currency: 'INR' }, // ₹5 00 000
			{ accountId: nreAccount.id, amount: 10000000, currency: 'INR' }, // ₹1 00 000
			{ accountId: openingINR.id, amount: -85000000, currency: 'INR' } // -₹8 50 000
		],
		'Initial INR account balances as of 2024-01-01'
	);

	// January 2024
	insertTx('2024-01-01', 'Deutschlandticket Januar 2024', [
		{ accountId: publicTransport.id, amount: 4900, currency: 'EUR' }, // €49
		{ accountId: dkbChecking.id, amount: -4900, currency: 'EUR' }
	]);

	insertTx('2024-01-02', 'Miete Januar 2024', [
		{ accountId: rent.id, amount: 120000, currency: 'EUR' }, // €1 200
		{ accountId: dkbChecking.id, amount: -120000, currency: 'EUR' }
	]);

	insertTx('2024-01-08', 'REWE Wocheneinkauf', [
		{ accountId: food.id, amount: 8750, currency: 'EUR' }, // €87.50
		{ accountId: dkbChecking.id, amount: -8750, currency: 'EUR' }
	]);

	insertTx('2024-01-14', 'Restaurant Zum Wohl', [
		{ accountId: restaurants.id, amount: 3250, currency: 'EUR' }, // €32.50
		{ accountId: cash.id, amount: -3250, currency: 'EUR' }
	]);

	insertTx(
		'2024-01-28',
		'Gehaltszahlung Januar 2024',
		[
			{ accountId: dkbChecking.id, amount: 400000, currency: 'EUR' }, // €4 000
			{ accountId: salary.id, amount: -400000, currency: 'EUR' }
		],
		'Net salary after Lohnsteuer and Sozialversicherung'
	);

	// February 2024
	insertTx('2024-02-02', 'Miete Februar 2024', [
		{ accountId: rent.id, amount: 120000, currency: 'EUR' },
		{ accountId: dkbChecking.id, amount: -120000, currency: 'EUR' }
	]);

	insertTx('2024-02-15', 'Stromrechnung Vattenfall', [
		{ accountId: utilities.id, amount: 8500, currency: 'EUR' }, // €85
		{ accountId: dkbChecking.id, amount: -8500, currency: 'EUR' }
	]);

	insertTx(
		'2024-02-20',
		'Überweisung auf Tagesgeld',
		[
			{ accountId: tagesgeld.id, amount: 100000, currency: 'EUR' }, // €1 000
			{ accountId: dkbChecking.id, amount: -100000, currency: 'EUR' }
		],
		'Monthly savings contribution'
	);

	insertTx('2024-02-28', 'Gehaltszahlung Februar 2024', [
		{ accountId: dkbChecking.id, amount: 400000, currency: 'EUR' },
		{ accountId: salary.id, amount: -400000, currency: 'EUR' }
	]);

	// March 2024
	insertTx('2024-03-02', 'Miete März 2024', [
		{ accountId: rent.id, amount: 120000, currency: 'EUR' },
		{ accountId: dkbChecking.id, amount: -120000, currency: 'EUR' }
	]);

	insertTx('2024-03-15', 'Lidl & Aldi Einkauf', [
		{ accountId: food.id, amount: 6230, currency: 'EUR' }, // €62.30
		{ accountId: dkbChecking.id, amount: -6230, currency: 'EUR' }
	]);

	insertTx(
		'2024-03-05',
		'Buy NIFTYBEES ETF — 20 units',
		[
			// 20 units @ ₹250 = ₹5 000 (stored as paise = 500 000)
			{
				accountId: zerodha.id,
				amount: 500000,
				currency: 'INR',
				commodityId: niftyBees.id,
				quantity: 20000 // milli-units: 20 000 = 20 units
			},
			{ accountId: nreAccount.id, amount: -500000, currency: 'INR' }
		],
		'Purchased 20 units of NIFTYBEES @ ₹250/unit'
	);

	insertTx('2024-03-28', 'Gehaltszahlung März 2024', [
		{ accountId: dkbChecking.id, amount: 400000, currency: 'EUR' },
		{ accountId: salary.id, amount: -400000, currency: 'EUR' }
	]);

	// April 2024
	insertTx(
		'2024-04-10',
		'Freiberufliche Rechnung #2024-001',
		[
			{ accountId: dkbChecking.id, amount: 150000, currency: 'EUR' }, // €1 500
			{ accountId: freelance.id, amount: -150000, currency: 'EUR' }
		],
		'Webentwicklung für Kunde XY'
	);

	insertTx('2024-04-20', 'Arztbesuch & Apotheke', [
		{ accountId: healthcare.id, amount: 2500, currency: 'EUR' }, // €25
		{ accountId: dkbChecking.id, amount: -2500, currency: 'EUR' }
	]);

	// May 2024
	insertTx(
		'2024-05-01',
		'PPF Annual Deposit FY 2024-25',
		[
			{ accountId: ppf.id, amount: 15000000, currency: 'INR' }, // ₹1 50 000
			{ accountId: nreAccount.id, amount: -15000000, currency: 'INR' }
		],
		'Annual PPF contribution — maximum limit'
	);

	// June 2024
	insertTx('2024-06-03', 'H&M Sommerbekleidung', [
		{ accountId: clothing.id, amount: 8900, currency: 'EUR' }, // €89
		{ accountId: visaCard.id, amount: -8900, currency: 'EUR' }
	]);

	insertTx('2024-06-30', 'Kreditkarten-Abbuchung Juni 2024', [
		{ accountId: visaCard.id, amount: 8900, currency: 'EUR' },
		{ accountId: dkbChecking.id, amount: -8900, currency: 'EUR' }
	]);

	// July 2024
	insertTx('2024-07-15', 'ETF-Ausschüttung — Dividende', [
		{ accountId: dkbChecking.id, amount: 4200, currency: 'EUR' }, // €42
		{ accountId: dividendEUR.id, amount: -4200, currency: 'EUR' }
	]);

	// August 2024 — Remittance to India via Wise
	// Multi-currency: each currency group must independently net to zero.
	// EUR side: DKB out (€930 principal + €9.50 fee), fxBridgeEUR absorbs the €930 principal.
	// INR side: NRE receives ₹85,000, fxBridgeINR is the contra source.
	insertTx(
		'2024-08-05',
		'Überweisung nach Indien (Wise)',
		[
			// EUR legs (sum = 950 - 93950 + 93000 = 0)
			{ accountId: transferFees.id, amount: 950, currency: 'EUR' }, // €9.50 fee
			{ accountId: dkbChecking.id, amount: -93950, currency: 'EUR' }, // total EUR out
			{ accountId: fxBridgeEUR.id, amount: 93000, currency: 'EUR' }, // €930 "converted"
			// INR legs (sum = 8500000 - 8500000 = 0)
			{ accountId: nreAccount.id, amount: 8500000, currency: 'INR' }, // ₹85,000 received
			{ accountId: fxBridgeINR.id, amount: -8500000, currency: 'INR' } // INR source
		],
		'Sent €930 → ₹85,000 via Wise (rate ≈ 91.4 INR/EUR). FX bridge accounts net to zero.'
	);

	// September 2024
	insertTx('2024-09-01', 'Streaming-Abonnements September 2024', [
		{ accountId: entertainment.id, amount: 2298, currency: 'EUR' }, // €22.98
		{ accountId: dkbChecking.id, amount: -2298, currency: 'EUR' }
	]);

	// October 2024 — SIP in HDFC Flexi Cap
	insertTx(
		'2024-10-05',
		'HDFC Flexi Cap SIP — Oktober 2024',
		[
			{
				accountId: zerodha.id,
				amount: 1000000,
				currency: 'INR', // ₹10 000
				commodityId: hdfcFlexi.id,
				quantity: 7240 // ≈7.24 units @ ₹1 380 NAV (milli-units)
			},
			{ accountId: nreAccount.id, amount: -1000000, currency: 'INR' }
		],
		'Monthly SIP ₹10,000 — HDFC Flexi Cap Direct Growth'
	);

	// December 2024
	insertTx(
		'2024-12-28',
		'Jahresabschluss — Tagesgeld aufstocken',
		[
			{ accountId: tagesgeld.id, amount: 200000, currency: 'EUR' }, // €2 000
			{ accountId: dkbChecking.id, amount: -200000, currency: 'EUR' }
		],
		'Year-end surplus moved to savings'
	);

	// January 2025
	insertTx('2025-01-02', 'Miete Januar 2025', [
		{ accountId: rent.id, amount: 125000, currency: 'EUR' }, // €1 250 (Mieterhöhung)
		{ accountId: dkbChecking.id, amount: -125000, currency: 'EUR' }
	]);

	insertTx(
		'2025-01-28',
		'Gehaltszahlung Januar 2025',
		[
			{ accountId: dkbChecking.id, amount: 420000, currency: 'EUR' }, // €4 200 (raise)
			{ accountId: salary.id, amount: -420000, currency: 'EUR' }
		],
		'New salary band effective January 2025'
	);

	// February 2025
	insertTx('2025-02-10', 'Wocheneinkauf REWE', [
		{ accountId: food.id, amount: 9430, currency: 'EUR' }, // €94.30
		{ accountId: dkbChecking.id, amount: -9430, currency: 'EUR' }
	]);

	// PPF interest credit (INR income)
	insertTx(
		'2025-03-31',
		'PPF Interest Credit FY 2024-25',
		[
			{ accountId: ppf.id, amount: 3650000, currency: 'INR' }, // ₹36 500 (7.1% on ₹5.14L)
			{ accountId: investmentReturnsINR.id, amount: -3650000, currency: 'INR' }
		],
		'Annual PPF interest @ 7.1% p.a.'
	);

	console.log('  Transactions seeded.');
	console.log('\nSeed complete!');
	console.log(`\nLogin at http://localhost:5173 with username="${username}" password="${password}"`);
}

seed()
	.catch((err) => {
		console.error('Seed failed:', err);
		process.exit(1);
	})
	.finally(() => sqlite.close());
