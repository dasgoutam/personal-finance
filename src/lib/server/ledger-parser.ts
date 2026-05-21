export interface ParsedPosting {
	accountPath: string; // full colon path e.g. "Assets:Bank:BankName"
	amount: number | null; // in cents, null = auto-balance
	currency: string;
	commoditySymbol?: string;
	quantity?: number; // micro-units (× 1_000_000)
}

export interface ParsedTransaction {
	date: string; // YYYY-MM-DD
	description: string;
	postings: ParsedPosting[];
}

/**
 * A flat account derived from a ledger posting.
 * Only leaf accounts (those directly referenced in transactions) are created.
 */
export interface ParsedAccount {
	path: string; // full path — used as deduplication key
	name: string; // last segment
	/** Maps to account_types.name in the DB */
	accountTypeName: string;
}

export interface LedgerParseResult {
	transactions: ParsedTransaction[];
	/** path → account (leaf accounts only) */
	accounts: Map<string, ParsedAccount>;
	/** symbol → { symbol, currency } */
	commodities: Map<string, { symbol: string; currency: string }>;
	warnings: string[];
}

// ---------------------------------------------------------------------------
// Regexes
// ---------------------------------------------------------------------------

const TX_HEADER_RE = /^(\d{4})\/(\d{2})\/(\d{2})[\t ]+[*!]?\s*(.*)/;
const COMMODITY_RE =
	/^(-?[0-9.]+)\s+([A-Za-z][A-Za-z0-9._-]*)\s+@\s+(-?[0-9,.]+)\s*([A-Za-z]+)$/;
const SIMPLE_AMOUNT_RE = /^(-?[0-9,.]+)\s*([A-Za-z]+)?$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse European-decimal number strings.
 * Strings with a comma are treated as European format (1.234,56 → 1234.56).
 * Strings with only dots use standard parseFloat (e.g. quantity "17.314").
 */
function parseEuropeanDecimal(s: string): number {
	if (s.includes(',')) {
		return parseFloat(s.replace(/\./g, '').replace(',', '.'));
	}
	return parseFloat(s);
}

/**
 * Map a full ledger account path to an account_types.name value.
 *
 * Mapping rules:
 *   Assets:Investments:Stocks:*  → Stocks
 *   Assets:Investments:ETF:*     → ETF
 *   Assets:Investments:Crypto:*  → Crypto
 *   Assets:Investments:*         → Bank (fallback)
 *   Assets:Equity:Stocks:*       → Stocks   (legacy paisa path)
 *   Assets:Equity:ETF:*          → ETF      (legacy paisa path)
 *   Assets:Equity:Crypto:*       → Crypto   (legacy paisa path)
 *   Assets:Equity:*              → Bank     (legacy paisa path fallback)
 *   Assets:*                     → Bank (fallback — bank-like asset)
 *   Income:*                     → Income
 *   Expenses:*                   → Expense
 *   Liabilities:*                → Liability
 *   Equity:*                     → Opening Balance
 */
function inferAccountTypeName(path: string): string {
	const [first, second, third] = path.split(':');

	switch (first) {
		case 'Assets':
			if (second === 'Investments' || second === 'Equity') {
				if (third === 'Stocks') return 'Stocks';
				if (third === 'ETF') return 'ETF';
				if (third === 'Crypto') return 'Crypto';
			}
			return 'Bank';
		case 'Income':
			return 'Income';
		case 'Expenses':
			return 'Expense';
		case 'Liabilities':
			return 'Liability';
		case 'Equity':
			return 'Opening Balance';
		default:
			return 'Expense';
	}
}

function parseAmountSpec(
	spec: string,
	defaultCurrency: string
): { amount: number; currency: string; commoditySymbol?: string; quantity?: number } | null {
	const trimmed = spec.trim();
	if (!trimmed) return null;

	const commodityMatch = trimmed.match(COMMODITY_RE);
	if (commodityMatch) {
		const quantityRaw = parseFloat(commodityMatch[1]);
		const symbol = commodityMatch[2];
		const priceRaw = parseEuropeanDecimal(commodityMatch[3]);
		const currency = commodityMatch[4].toUpperCase();
		return {
			amount: Math.round(quantityRaw * priceRaw * 100),
			currency,
			commoditySymbol: symbol,
			quantity: Math.round(quantityRaw * 1_000_000)
		};
	}

	const simpleMatch = trimmed.match(SIMPLE_AMOUNT_RE);
	if (simpleMatch) {
		const value = parseEuropeanDecimal(simpleMatch[1]);
		const currency = simpleMatch[2] ? simpleMatch[2].toUpperCase() : defaultCurrency;
		return { amount: Math.round(value * 100), currency };
	}

	return null;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseLedger(content: string): LedgerParseResult {
	const lines = content.split('\n');
	const transactions: ParsedTransaction[] = [];
	const accounts = new Map<string, ParsedAccount>();
	const commodities = new Map<string, { symbol: string; currency: string }>();
	const warnings: string[] = [];

	let currentTx: { date: string; description: string; rawPostings: string[] } | null = null;

	function flushTransaction() {
		if (!currentTx) return;
		const tx = currentTx;
		currentTx = null;

		if (tx.rawPostings.length < 2) {
			warnings.push(
				`Transaction on ${tx.date} "${tx.description}" has fewer than 2 postings, skipping.`
			);
			return;
		}

		const postings: ParsedPosting[] = [];
		let autoBalanceIndex: number | null = null;

		for (const raw of tx.rawPostings) {
			const parts = raw.split(/\t| {2,}/, 2);
			const accountPath = parts[0].trim();
			const amountSpec = parts.length > 1 ? parts[1].trim() : '';

			if (!accountPath) continue;

			const parsed = parseAmountSpec(amountSpec, 'EUR');

			if (parsed === null) {
				if (autoBalanceIndex !== null) {
					warnings.push(
						`Transaction on ${tx.date} "${tx.description}" has multiple auto-balance postings, skipping.`
					);
					return;
				}
				autoBalanceIndex = postings.length;
				postings.push({ accountPath, amount: null, currency: 'EUR' });
			} else {
				postings.push({
					accountPath,
					amount: parsed.amount,
					currency: parsed.currency,
					commoditySymbol: parsed.commoditySymbol,
					quantity: parsed.quantity
				});
			}
		}

		// Resolve auto-balance
		if (autoBalanceIndex !== null) {
			const sumByCurrency = new Map<string, number>();
			for (const p of postings) {
				if (p.amount !== null) {
					sumByCurrency.set(p.currency, (sumByCurrency.get(p.currency) ?? 0) + p.amount);
				}
			}

			if (sumByCurrency.size === 0) {
				warnings.push(
					`Transaction on ${tx.date} "${tx.description}" auto-balance cannot be resolved, skipping.`
				);
				return;
			}

			if (sumByCurrency.size > 1) {
				if (!sumByCurrency.has('EUR')) {
					warnings.push(
						`Transaction on ${tx.date} "${tx.description}" auto-balance is ambiguous, skipping.`
					);
					return;
				}
				postings[autoBalanceIndex].amount = -sumByCurrency.get('EUR')!;
				postings[autoBalanceIndex].currency = 'EUR';
			} else {
				const [currency, sum] = [...sumByCurrency.entries()][0];
				postings[autoBalanceIndex].amount = -sum;
				postings[autoBalanceIndex].currency = currency;
			}
		}

		if (postings.some((p) => p.amount === null)) {
			warnings.push(
				`Transaction on ${tx.date} "${tx.description}" has unresolved amounts, skipping.`
			);
			return;
		}

		// Verify balance
		const sumByCurrency = new Map<string, number>();
		for (const p of postings) {
			sumByCurrency.set(p.currency, (sumByCurrency.get(p.currency) ?? 0) + p.amount!);
		}
		for (const [currency, sum] of sumByCurrency) {
			if (sum !== 0) {
				warnings.push(
					`Transaction on ${tx.date} "${tx.description}" is unbalanced for ${currency} (sum=${sum}), skipping.`
				);
				return;
			}
		}

		// Register leaf accounts and commodities
		for (const p of postings) {
			if (!accounts.has(p.accountPath)) {
				const segments = p.accountPath.split(':');
				accounts.set(p.accountPath, {
					path: p.accountPath,
					name: segments[segments.length - 1],
					accountTypeName: inferAccountTypeName(p.accountPath)
				});
			}
			if (p.commoditySymbol && !commodities.has(p.commoditySymbol)) {
				commodities.set(p.commoditySymbol, {
					symbol: p.commoditySymbol,
					currency: p.currency
				});
			}
		}

		transactions.push({
			date: tx.date,
			description: tx.description,
			postings: postings as ParsedPosting[]
		});
	}

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];

		if (line.startsWith('=')) {
			flushTransaction();
			i++;
			while (i < lines.length && lines[i].trim() !== '') i++;
			continue;
		}

		if (line.startsWith(';') || line.startsWith('#') || /^[a-z]/.test(line)) {
			i++;
			continue;
		}

		if (line.trim() === '') {
			flushTransaction();
			i++;
			continue;
		}

		const txMatch = line.match(TX_HEADER_RE);
		if (txMatch) {
			flushTransaction();
			currentTx = {
				date: `${txMatch[1]}-${txMatch[2]}-${txMatch[3]}`,
				description: txMatch[4].trim(),
				rawPostings: []
			};
			i++;
			continue;
		}

		if (currentTx && (line.startsWith(' ') || line.startsWith('\t'))) {
			const stripped = line.trim();
			if (!stripped.startsWith(';') && !stripped.startsWith('#') && stripped) {
				currentTx.rawPostings.push(stripped);
			}
			i++;
			continue;
		}

		i++;
	}

	flushTransaction();

	return { transactions, accounts, commodities, warnings };
}
