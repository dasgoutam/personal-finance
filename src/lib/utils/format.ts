export function fmt(amount: number, currency: string) {
	return new Intl.NumberFormat('de-DE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount / 100)
}

export function fmtUnits(units: number, symbol: string) {
	const qty = units / 1_000_000
	return `${qty.toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 6 })} ${symbol}`
}
