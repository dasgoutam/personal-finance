import { and, eq, sql } from 'drizzle-orm'
import { db } from '$lib/server/db'
import { accounts, accountTypes, commodities, journalEntries, transactions } from '$lib/server/db/schema'
import { computeXirr } from '$lib/utils/xirr'

const INVESTMENT_TYPES = ['Stocks', 'ETF', 'Crypto']
const INVESTMENT_TYPES_SQL = sql.join(INVESTMENT_TYPES.map(t => sql`${t}`), sql`, `)

export type InvestmentBreakdownRow = {
	id: number
	name: string
	currency: string
	typeName: string
	costBasis: number
	marketValue: number | null
	pnl: number | null
	xirr: number | null
}

export async function loadInvestments(prevMonthEndStr: string) {
	const investmentAccounts = await db
		.select({
			id: accounts.id,
			name: accounts.name,
			currency: accounts.currency,
			typeName: accountTypes.name,
			commoditySymbol: commodities.symbol,
			units: sql<number>`coalesce(sum(${journalEntries.quantity}), 0)`,
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(commodities, eq(commodities.id, accounts.commodityId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.where(and(
			eq(accounts.isActive, true),
			sql`${accountTypes.name} IN (${INVESTMENT_TYPES_SQL})`
		))
		.groupBy(accounts.id)
		.orderBy(accountTypes.name, accounts.name)

	const cashflowRows = await db
		.select({
			accountId: journalEntries.accountId,
			date: transactions.date,
			amount: sql<number>`sum(${journalEntries.amount})`,
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
		.orderBy(journalEntries.accountId, transactions.date)

	const cfByAccount = new Map<number, { amount: number; date: string }[]>()
	for (const row of cashflowRows) {
		if (!cfByAccount.has(row.accountId)) cfByAccount.set(row.accountId, [])
		cfByAccount.get(row.accountId)!.push({ amount: row.amount, date: row.date })
	}

	// Total invested (current) and as of end of previous month — for the summary card
	const [totalInvested, prevTotalInvested] = await Promise.all([
		db.select({
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			currency: accounts.currency,
		})
			.from(accounts)
			.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
			.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
			.where(and(
				eq(accounts.isActive, true),
				sql`${accountTypes.name} IN (${INVESTMENT_TYPES_SQL})`
			))
			.groupBy(accounts.currency),

		db.select({
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			currency: accounts.currency,
		})
			.from(accounts)
			.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
			.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
			.leftJoin(transactions, eq(journalEntries.transactionId, transactions.id))
			.where(and(
				eq(accounts.isActive, true),
				sql`${accountTypes.name} IN (${INVESTMENT_TYPES_SQL})`,
				sql`(${transactions.date} IS NULL OR ${transactions.date} <= ${prevMonthEndStr})`
			))
			.groupBy(accounts.currency),
	])

	// Live prices from Yahoo Finance
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const YahooFinance = (await import('yahoo-finance2')).default as any
	const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

	const uniqueSymbols = [...new Set(
		investmentAccounts.map(a => a.commoditySymbol).filter(Boolean) as string[]
	)]

	const livePrice = new Map<string, number>()
	await Promise.allSettled(
		uniqueSymbols.map(async symbol => {
			try {
				const summary = await yf.quoteSummary(symbol, { modules: ['price'] })
				const price = summary?.price?.regularMarketPrice
				if (typeof price === 'number') livePrice.set(symbol, Math.round(price * 100))
			} catch { /* leave missing */ }
		})
	)

	const today = new Date()

	const investmentBreakdown: InvestmentBreakdownRow[] = investmentAccounts.map(acct => {
		const cashflows = cfByAccount.get(acct.id) ?? []
		const costBasis = cashflows.reduce((s, c) => s + c.amount, 0)

		let marketValue: number | null = null
		if (acct.units > 0 && acct.commoditySymbol) {
			const pricePerUnit = livePrice.get(acct.commoditySymbol) ?? null
			if (pricePerUnit !== null) {
				const rawMV = Math.round((acct.units / 1_000_000) * pricePerUnit)
				const impliedPriceCents = costBasis / (acct.units / 1_000_000)
				const ratio = pricePerUnit / impliedPriceCents
				if (ratio > 0.2 && ratio < 5) marketValue = rawMV
			}
		}

		let xirrVal: number | null = null
		if (marketValue !== null && cashflows.length > 0) {
			const cfs = [
				...cashflows.map(c => ({ amount: -c.amount, when: new Date(c.date) })),
				{ amount: marketValue, when: today },
			]
			xirrVal = computeXirr(cfs)
		}

		return {
			id: acct.id,
			name: acct.name,
			currency: acct.currency,
			typeName: acct.typeName,
			costBasis,
			marketValue,
			pnl: marketValue !== null ? marketValue - costBasis : null,
			xirr: xirrVal,
		}
	})

	const allCfs: { amount: number; when: Date }[] = []
	for (const row of investmentBreakdown) {
		if (row.marketValue === null) continue
		const cashflows = cfByAccount.get(row.id) ?? []
		for (const c of cashflows) allCfs.push({ amount: -c.amount, when: new Date(c.date) })
		allCfs.push({ amount: row.marketValue, when: today })
	}
	const totalXirr = computeXirr(allCfs)

	return { investmentBreakdown, totalXirr, totalInvested, prevTotalInvested }
}
