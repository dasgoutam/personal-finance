import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadNetWorth } from '$lib/server/networth';
import { loadIncome } from '$lib/server/income';
import { loadExpenses } from '$lib/server/expenses';
import { loadInvestments } from '$lib/server/investments';
import { loadPortfolioHistory } from '$lib/server/portfolio-history';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const now = new Date()

	const prevMonthEndStr = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)

	const last3Months = Array.from({ length: 3 }, (_, i) => {
		const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)
		return {
			year: String(d.getFullYear()),
			month: String(d.getMonth() + 1).padStart(2, '0'),
			label: d.toLocaleString('default', { month: 'short', year: '2-digit' })
		}
	}).reverse()

	const mode  = url.searchParams.get('mode')  ?? 'month'
	const year  = url.searchParams.get('year')  ?? String(now.getFullYear())
	const month = url.searchParams.get('month') ?? String(now.getMonth() + 1).padStart(2, '0')

	const [networth, income, expenses, investments, portfolioHistory] = await Promise.all([
		loadNetWorth(prevMonthEndStr),
		loadIncome(last3Months),
		loadExpenses(mode, year, month),
		loadInvestments(prevMonthEndStr),
		loadPortfolioHistory('SXRV.DE'),
	])

	return {
		...networth,
		...income,
		...expenses,
		...investments,
		portfolioHistory,
		mode, year, month,
	};
};
