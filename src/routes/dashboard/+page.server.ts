import { redirect } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { accounts, accountTypes, commodities, journalEntries, transactions } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';
import { computeXirr } from '$lib/utils/xirr';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const now = new Date()

	// Last day of previous month — used for MoM comparisons
	const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
	const prevMonthEndStr = prevMonthEnd.toISOString().slice(0, 10)

	// Last 3 completed months helpers
	const last3Months = Array.from({ length: 3 }, (_, i) => {
		const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)
		return {
			year: String(d.getFullYear()),
			month: String(d.getMonth() + 1).padStart(2, '0'),
			label: d.toLocaleString('default', { month: 'short', year: '2-digit' })
		}
	}).reverse()

	// Recent transactions
	const recentTransactions = await db
		.select({
			id: transactions.id,
			date: transactions.date,
			description: transactions.description,
			notes: transactions.notes,
			entryCount: sql<number>`count(${journalEntries.id})`
		})
		.from(transactions)
		.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
		.groupBy(transactions.id)
		.orderBy(desc(transactions.date), desc(transactions.id))
		.limit(20);

	// Per-account balances with type info
	const accountBalances = await db
		.select({
			id: accounts.id,
			name: accounts.name,
			currency: accounts.currency,
			typeName: accountTypes.name,
			typeCategory: accountTypes.category,
			commoditySymbol: commodities.symbol,
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			units: sql<number>`coalesce(sum(${journalEntries.quantity}), 0)`
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(commodities, eq(commodities.id, accounts.commodityId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.where(eq(accounts.isActive, true))
		.groupBy(accounts.id)
		.orderBy(accountTypes.name, accounts.name);

	const mode = url.searchParams.get('mode') ?? 'month'
	const year = url.searchParams.get('year') ?? String(now.getFullYear())
	const month = url.searchParams.get('month') ?? String(now.getMonth() + 1).padStart(2, '0')

	const expenseGrouping = await db
		.select({
			category: accounts.name,
			total: sql<number>`sum(${journalEntries.amount})`,
		})
		.from(journalEntries)
		.innerJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.innerJoin(accounts, eq(journalEntries.accountId, accounts.id))
		.where(and(
			eq(accounts.accountTypeId, 7),
			sql`strftime('%Y', ${transactions.date}) = ${year}`,
			mode === 'month'
				? sql`strftime('%m', ${transactions.date}) = ${month}`
				: undefined
		))
		.groupBy(accounts.name)
		.orderBy(sql`sum(${journalEntries.amount}) desc`)

	// Net worth as of end of previous month
	const prevNetWorthRows = await db
		.select({
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			typeCategory: accountTypes.category,
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.leftJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.where(and(
			eq(accounts.isActive, true),
			sql`(${transactions.date} IS NULL OR ${transactions.date} <= ${prevMonthEndStr})`
		))
		.groupBy(accountTypes.category)

	const prevNetWorth = prevNetWorthRows.reduce((sum, r) => {
		if (r.typeCategory === 'asset')     return sum + r.balance
		if (r.typeCategory === 'liability') return sum - r.balance
		return sum
	}, 0)

	// Total invested (current)
	const investmentRows = await db
		.select({
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			currency: accounts.currency,
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.where(and(
			eq(accounts.isActive, true),
			sql`${accountTypes.name} IN ('Stocks', 'ETF', 'Crypto')`
		))
		.groupBy(accounts.currency)

	// Total invested as of end of previous month
	const prevInvestmentRows = await db
		.select({
			balance: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			currency: accounts.currency,
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.leftJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.where(and(
			eq(accounts.isActive, true),
			sql`${accountTypes.name} IN ('Stocks', 'ETF', 'Crypto')`,
			sql`(${transactions.date} IS NULL OR ${transactions.date} <= ${prevMonthEndStr})`
		))
		.groupBy(accounts.currency)

	// Monthly income: last 3 months
	const monthlyIncomeRows = await db
		.select({
			yearMonth: sql<string>`strftime('%Y-%m', ${transactions.date})`,
			total: sql<number>`-sum(${journalEntries.amount})`,
		})
		.from(journalEntries)
		.innerJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.innerJoin(accounts, eq(journalEntries.accountId, accounts.id))
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.where(and(
			eq(accountTypes.category, 'income'),
			sql`strftime('%Y-%m', ${transactions.date}) IN (${sql.join(last3Months.map(m => sql`${m.year + '-' + m.month}`), sql`, `)})`
		))
		.groupBy(sql`strftime('%Y-%m', ${transactions.date})`)

	const monthlyIncome = last3Months.map(m => ({
		label: m.label,
		total: monthlyIncomeRows.find(r => r.yearMonth === `${m.year}-${m.month}`)?.total ?? 0
	}))

	// Monthly expenses: last 3 months
	const monthlyExpenseRows = await db
		.select({
			yearMonth: sql<string>`strftime('%Y-%m', ${transactions.date})`,
			total: sql<number>`sum(${journalEntries.amount})`,
		})
		.from(journalEntries)
		.innerJoin(transactions, eq(journalEntries.transactionId, transactions.id))
		.innerJoin(accounts, eq(journalEntries.accountId, accounts.id))
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.where(and(
			eq(accountTypes.category, 'expense'),
			sql`strftime('%Y-%m', ${transactions.date}) IN (${sql.join(last3Months.map(m => sql`${m.year + '-' + m.month}`), sql`, `)})`
		))
		.groupBy(sql`strftime('%Y-%m', ${transactions.date})`)

	const monthlyExpenses = last3Months.map(m => ({
		label: m.label,
		total: monthlyExpenseRows.find(r => r.yearMonth === `${m.year}-${m.month}`)?.total ?? 0
	}))

	// Investment breakdown — per-account cashflows for XIRR/CAGR
	const INVESTMENT_TYPES = ['Stocks', 'ETF', 'Crypto']

	const investmentAccounts = await db
		.select({
			id: accounts.id,
			name: accounts.name,
			currency: accounts.currency,
			typeName: accountTypes.name,
			commodityId: accounts.commodityId,
			commoditySymbol: commodities.symbol,
			costBasis: sql<number>`coalesce(sum(${journalEntries.amount}), 0)`,
			units: sql<number>`coalesce(sum(${journalEntries.quantity}), 0)`,
		})
		.from(accounts)
		.innerJoin(accountTypes, eq(accountTypes.id, accounts.accountTypeId))
		.leftJoin(commodities, eq(commodities.id, accounts.commodityId))
		.leftJoin(journalEntries, eq(journalEntries.accountId, accounts.id))
		.where(and(
			eq(accounts.isActive, true),
			sql`${accountTypes.name} IN (${sql.join(INVESTMENT_TYPES.map(t => sql`${t}`), sql`, `)})`
		))
		.groupBy(accounts.id)
		.orderBy(accountTypes.name, accounts.name)

	// Fetch dated cashflows per investment account for XIRR/CAGR
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
			sql`${accountTypes.name} IN (${sql.join(INVESTMENT_TYPES.map(t => sql`${t}`), sql`, `)})`
		))
		.groupBy(journalEntries.accountId, transactions.date)
		.orderBy(journalEntries.accountId, transactions.date)

	// Group cashflows by accountId
	const cfByAccount = new Map<number, { amount: number; date: string }[]>()
	for (const row of cashflowRows) {
		if (!cfByAccount.has(row.accountId)) cfByAccount.set(row.accountId, [])
		cfByAccount.get(row.accountId)!.push({ amount: row.amount, date: row.date })
	}

	// Fetch live prices from Yahoo Finance for all unique symbols
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const YahooFinance = (await import('yahoo-finance2')).default as any
	const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

	const uniqueSymbols = [...new Set(
		investmentAccounts.map(a => a.commoditySymbol).filter(Boolean) as string[]
	)]

	// livePrice: symbol → price in minor currency units (cents), cross-checked
	// against implied price from DB so we catch Yahoo returning wrong scale.
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

	const investmentBreakdown = investmentAccounts.map(acct => {
		const cashflows = cfByAccount.get(acct.id) ?? []
		// costBasis = sum of all positive amounts (purchases)
		const costBasis = cashflows.reduce((s, c) => s + c.amount, 0)

		// Market value: units stored in millionths (1_000_000 = 1 whole unit)
		let marketValue: number | null = null
		if (acct.units > 0 && acct.commoditySymbol) {
			const pricePerUnit = livePrice.get(acct.commoditySymbol) ?? null
			if (pricePerUnit !== null) {
				const rawMV = Math.round((acct.units / 1_000_000) * pricePerUnit)
				// Sanity-check: Yahoo price vs implied price from DB (reject if >5× off)
				const impliedPriceCents = costBasis / (acct.units / 1_000_000)
				const ratio = pricePerUnit / impliedPriceCents
				if (ratio > 0.2 && ratio < 5) marketValue = rawMV
			}
		}

		// XIRR: DB amounts are positive (money into the asset = money OUT of pocket).
		// xirr library convention: outflows negative, inflows positive.
		// So: purchases → -amount, terminal value → +marketValue.
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

	// Total XIRR: pool every per-account cashflow series (only accounts that have a market value)
	const totalXirr = (() => {
		const allCfs: { amount: number; when: Date }[] = []
		for (const row of investmentBreakdown) {
			if (row.marketValue === null) continue
			const cashflows = cfByAccount.get(row.id) ?? []
			for (const c of cashflows) allCfs.push({ amount: -c.amount, when: new Date(c.date) })
			allCfs.push({ amount: row.marketValue, when: today })
		}
		return computeXirr(allCfs)
	})()

	return {
		recentTransactions, accountBalances, expenseGrouping, mode, year, month,
		totalInvested: investmentRows,
		prevNetWorth,
		prevTotalInvested: prevInvestmentRows,
		monthlyIncome,
		monthlyExpenses,
		investmentBreakdown,
		totalXirr,
	};
};
