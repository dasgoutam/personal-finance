import { json } from '@sveltejs/kit'
import { loadPortfolioHistory } from '$lib/server/portfolio-history'
import { loadInvestments } from '$lib/server/investments'

export const GET = async () => {
  const now = new Date()
  const prevMonthEndStr = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)
  const [ph, inv] = await Promise.all([loadPortfolioHistory(), loadInvestments(prevMonthEndStr)])

  // Show per-account breakdown from table
  const accountDetail = inv.investmentBreakdown.map(r => ({
    name: r.name,
    costBasis: r.costBasis,
    marketValue: r.marketValue,
    xirr: r.xirr,
  }))

  return json({
    chartXirr: ph.portfolioXirr,
    tableXirr: inv.totalXirr,
    chartTerminalValue: ph.points.at(-1)?.portfolioValue,
    chartTotalCashFlows: ph.points.length,
    accountDetail,
  })
}
