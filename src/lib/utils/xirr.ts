import xirrLib from 'xirr'

export type CashFlow = { amount: number; when: Date }

/**
 * Thin wrapper around the xirr npm package.
 *
 * Sign convention (same as the library):
 *   - money paid OUT  → negative amount  (purchases)
 *   - money received  → positive amount  (terminal/sale value)
 *
 * Returns null if the library throws (non-convergence, degenerate input, etc.)
 */
export function computeXirr(cashflows: CashFlow[]): number | null {
	if (cashflows.length < 2) return null
	try {
		return xirrLib(cashflows)
	} catch {
		return null
	}
}
