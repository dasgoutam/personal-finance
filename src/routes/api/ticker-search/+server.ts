import { json } from '@sveltejs/kit';
import YahooFinance from 'yahoo-finance2';
import type { RequestHandler } from './$types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] });

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const q = url.searchParams.get('q')?.trim();
	if (!q || q.length < 1) return json([]);

	try {
		const results = await yf.search(q, { newsCount: 0, quotesCount: 8 });
		const quotes = ((results.quotes ?? []) as Array<Record<string, unknown>>)
			.filter((r) => r.quoteType && ['EQUITY', 'ETF', 'CRYPTOCURRENCY', 'MUTUALFUND'].includes(r.quoteType as string))
			.map((r) => ({
				symbol: r.symbol as string,
				name: (r.shortname ?? r.longname ?? r.symbol) as string,
				exchange: (r.exchange ?? '') as string,
				type: quoteTypeToType(r.quoteType as string)
			}));
		return json(quotes);
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
};

function quoteTypeToType(quoteType: string): string {
	if (quoteType === 'ETF' || quoteType === 'MUTUALFUND') return 'etf';
	if (quoteType === 'CRYPTOCURRENCY') return 'crypto';
	if (quoteType === 'EQUITY') return 'stock';
	return 'other';
}
