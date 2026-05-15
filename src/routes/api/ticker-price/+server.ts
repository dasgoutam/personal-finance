import { json } from '@sveltejs/kit';
import YahooFinance from 'yahoo-finance2';
import type { RequestHandler } from './$types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] });

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const symbol = url.searchParams.get('symbol')?.trim();
	if (!symbol) return json({ error: 'symbol required' }, { status: 400 });

	try {
		const summary = await yf.quoteSummary(symbol, { modules: ['price'] });
		const price = summary?.price as Record<string, unknown> | undefined;
		return json({
			symbol,
			name: (price?.shortName ?? symbol) as string,
			price: (price?.regularMarketPrice ?? null) as number | null,
			currency: (price?.currency ?? null) as string | null,
			changePercent: (price?.regularMarketChangePercent ?? null) as number | null
		});
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
};
