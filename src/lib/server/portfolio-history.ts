import { and, eq, sql } from 'drizzle-orm'
import { db } from '$lib/server/db'
import { accounts, accountTypes, commodities, journalEntries, transactions } from '$lib/server/db/schema'
import { computeXirr } from '$lib/utils/xirr'

// Use local date to avoid UTC timezone shifting date strings
function localDateStr(d: Date): string {
	const y = d.getFullYear()
	const mo = String(d.getMonth() + 1).padStart(2, '0')
	const dy = String(d.getDate()).padStart(2, '0')
	return `${y}-${mo}-${dy}`
}

const INVESTMENT_TYPES = ['Stocks', 'ETF', 'Crypto']
const INVESTMENT_TYPES_SQL = sql.join(INVESTMENT_TYPES.map(t => sql`${t}`), sql`, `)

export type PortfolioHistoryPoint = {
	date: string              // YYYY-MM-DD (month-end)
	portfolioValue: number    // EUR cents
	benchmarkIndexed: number | null  // benchmark value if same cash flows invested (EUR cents)
}

export type PortfolioHistoryResult = {
	points: PortfolioHistoryPoint[]
	portfolioXirr: number | null
	benchmarkXirr: number | null
	benchmarkTicker: string
}

export const DEFAULT_BENCHMARK = '^GSPC'

export async function loadPortfolioHistory(benchmarkTicker = DEFAULT_BENCHMARK): Promise<PortfolioHistoryResult> {
	const empty: PortfolioHistoryResult = { points: [], portfolioXirr: null, benchmarkXirr: null, benchmarkTicker }

	// 1. Get all investment accounts with commodity symbols
	const investmentAccounts = await db
		.select({
			id: accounts.id,
			commoditySymbol: commodities.symbol,
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(commodities, eq(commodities.id, accounts.commodityId))
		.where(and(
			eq(accounts.isActive, true),
			sql`${accountTypes.name} IN (${INVESTMENT_TYPES_SQL})`
		))

	if (investmentAccounts.length === 0) return empty

	// 2. Get all cashflows (quantity per account per date)
	const cashflowRows = await db
		.select({
			accountId: journalEntries.accountId,
			date: transactions.date,
			amount: sql<number>`sum(${journalEntries.amount})`,
			quantity: sql<number>`sum(${journalEntries.quantity})`,
		})
		.from(journalEntries)
		.innerJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.innerJoin(accounts, eq(accounts.id, journalEntries.accountId))
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.where(and(
			eq(accounts.isActive, true),
			sql`${accountTypes.name} IN (${INVESTMENT_TYPES_SQL})`
		))
		.groupBy(journalEntries.accountId, transactions.date)
		.orderBy(transactions.date)

	if (cashflowRows.length === 0) return empty

	// 3. Build month-end date list from first transaction to today
	const firstDate = new Date(cashflowRows[0].date)
	const today = new Date()
	const monthEnds: string[] = []
	let y = firstDate.getFullYear()
	let m = firstDate.getMonth() // 0-based
	while (true) {
		const lastDay = new Date(y, m + 1, 0) // last day of current month
		if (lastDay > today) break
		monthEnds.push(localDateStr(lastDay))
		m++
		if (m > 11) { m = 0; y++ }
	}
	monthEnds.push(localDateStr(today))

	if (monthEnds.length < 2) return empty

	// 4. Fetch historical prices using chart() for full history
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const YahooFinance = (await import('yahoo-finance2')).default as any
	const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })

	const uniqueSymbols = [
		...new Set(investmentAccounts.map(a => a.commoditySymbol).filter(Boolean) as string[])
	]

	// Pull back one month so monthly bars covering the first transaction date are included
	const period1Start = new Date(firstDate.getFullYear(), firstDate.getMonth() - 1, 1)
	const period1 = localDateStr(period1Start)
	const period2 = localDateStr(today)

	// symbol -> sorted { date: string, closeInCents: number }
	const priceHistory = new Map<string, { date: string; closeInCents: number }[]>()

	const parseQuotes = (quotes: { date: Date; close: number | null }[]) =>
		quotes
			.filter(q => q.close != null)
			.map(q => ({
				date: localDateStr(new Date(q.date)),
				closeInCents: Math.round(q.close! * 100),
			}))
			.sort((a, b) => a.date.localeCompare(b.date))

	await Promise.allSettled([
		...uniqueSymbols.map(async symbol => {
			try {
				const result = await yf.chart(symbol, { period1, period2, interval: '1mo' })
				const prices = parseQuotes(result?.quotes ?? [])
				if (prices.length > 0) priceHistory.set(symbol, prices)
			} catch { /* skip */ }
		}),
		(async () => {
			try {
				const result = await yf.chart(benchmarkTicker, { period1, period2, interval: '1mo' })
				const prices = parseQuotes(result?.quotes ?? [])
				if (prices.length > 0) priceHistory.set(benchmarkTicker, prices)
			} catch { /* skip */ }
		})(),
	])

	// Helper: price at or before a given date (binary search)
	function priceAtDate(symbol: string, dateStr: string): number | null {
		const prices = priceHistory.get(symbol)
		if (!prices || prices.length === 0) return null
		let lo = 0, hi = prices.length - 1, found = -1
		while (lo <= hi) {
			const mid = (lo + hi) >> 1
			if (prices[mid].date <= dateStr) { found = mid; lo = mid + 1 }
			else hi = mid - 1
		}
		return found >= 0 ? prices[found].closeInCents : null
	}

	// 5. Group cashflows by account
	const cfByAccount = new Map<number, { date: string; quantity: number; amountCents: number }[]>()
	for (const row of cashflowRows) {
		if (!cfByAccount.has(row.accountId)) cfByAccount.set(row.accountId, [])
		cfByAccount.get(row.accountId)!.push({
			date: row.date,
			quantity: row.quantity ?? 0,
			amountCents: row.amount,
		})
	}

	// 6. For each month-end, compute portfolio value
	const points: PortfolioHistoryPoint[] = monthEnds.map(dateStr => {
		let total = 0
		for (const acct of investmentAccounts) {
			if (!acct.commoditySymbol) continue
			const rows = cfByAccount.get(acct.id) ?? []
			const cumulativeUnits = rows
				.filter(r => r.date <= dateStr)
				.reduce((s, r) => s + r.quantity, 0)
			if (cumulativeUnits <= 0) continue
			const priceCents = priceAtDate(acct.commoditySymbol, dateStr)
			if (priceCents === null) continue
			total += Math.round((cumulativeUnits / 1_000_000) * priceCents)
		}
		return { date: dateStr, portfolioValue: total, benchmarkIndexed: null }
	})

	// 7. Aggregate cash flows by date across all accounts (EUR cents)
	const cfByDate = new Map<string, number>()
	for (const rows of cfByAccount.values()) {
		for (const r of rows) {
			cfByDate.set(r.date, (cfByDate.get(r.date) ?? 0) + r.amountCents)
		}
	}
	const sortedCfDates = [...cfByDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))

	// 8. Benchmark chart line: simulate investing same cash flows into benchmark ticker
	for (const p of points) {
		let benchmarkUnits = 0
		for (const [cfDate, amountCents] of sortedCfDates) {
			if (cfDate > p.date) break
			const buyPrice = priceAtDate(benchmarkTicker, cfDate)
			if (buyPrice && buyPrice > 0) benchmarkUnits += amountCents / buyPrice
		}
		const benchmarkPriceAtMonth = priceAtDate(benchmarkTicker, p.date)
		if (benchmarkUnits > 0 && benchmarkPriceAtMonth) {
			p.benchmarkIndexed = Math.round(benchmarkUnits * benchmarkPriceAtMonth)
		}
	}

	// 9. XIRR calculations
	const benchmarkTerminalValueCents = points.at(-1)?.benchmarkIndexed ?? null
	let benchmarkXirr: number | null = null
	if (benchmarkTerminalValueCents && benchmarkTerminalValueCents > 0) {
		const benchmarkCfs = [
			...sortedCfDates.map(([date, amt]) => ({ amount: -amt, when: new Date(date) })),
			{ amount: benchmarkTerminalValueCents, when: today },
		]
		benchmarkXirr = computeXirr(benchmarkCfs)
	}

	const currentPortfolioValue = points.at(-1)?.portfolioValue ?? 0
	let portfolioXirr: number | null = null
	if (currentPortfolioValue > 0) {
		const portfolioCfs = [
			...sortedCfDates.map(([date, amt]) => ({ amount: -amt, when: new Date(date) })),
			{ amount: currentPortfolioValue, when: today },
		]
		portfolioXirr = computeXirr(portfolioCfs)
	}

	return {
		points: points.filter(p => p.portfolioValue > 0),
		portfolioXirr,
		benchmarkXirr,
		benchmarkTicker,
	}
}
