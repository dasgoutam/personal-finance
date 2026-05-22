<script lang="ts">
	import { LineChart } from 'layerchart'

	type HistoryPoint = {
		date: string
		portfolioValue: number
		benchmarkIndexed: number | null
	}

	type PortfolioHistoryResult = {
		points: HistoryPoint[]
		portfolioXirr: number | null
		benchmarkXirr: number | null
		benchmarkTicker: string
	}

	export let history: PortfolioHistoryResult

	$: points = history.points
	$: portfolioXirr = history.portfolioXirr
	$: benchmarkXirr = history.benchmarkXirr
	$: benchmarkTicker = history.benchmarkTicker

	// Parse YYYY-MM-DD as local midnight to avoid UTC shift making tooltip show wrong month
	function parseLocalDate(s: string): Date {
		const [y, m, d] = s.split('-').map(Number)
		return new Date(y, m - 1, d)
	}

	$: portfolioData = points.map(p => ({ date: parseLocalDate(p.date), value: p.portfolioValue / 100 }))
	$: benchmarkData = points
		.filter(p => p.benchmarkIndexed !== null)
		.map(p => ({ date: parseLocalDate(p.date), value: (p.benchmarkIndexed as number) / 100 }))

	function fmtEur(v: number): string {
		return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
	}

	function fmtAxisDate(d: Date): string {
		return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
	}

	function fmtTooltipDate(d: Date): string {
		return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
	}

	function fmtXirr(v: number | null): string {
		if (v === null) return '—'
		return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const xAxisFormat = (d: any) => fmtAxisDate(d as Date)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const yAxisFormat = (v: any) => fmtEur(v as number)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const tooltipHeaderFormat = (d: any) => fmtTooltipDate(d as Date)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const tooltipItemFormat = (v: any) => fmtEur(v as number)

	// Adaptive x-axis ticks: quarterly up to 2 years, every 6 months beyond.
	// Uses the actual data dates so ticks never fall outside the chart's x-domain.
	$: xTicks = (() => {
		if (points.length < 2) return 4
		const first = parseLocalDate(points[0].date)
		const last  = parseLocalDate(points[points.length - 1].date)
		const months = (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth())
		const step = months <= 24 ? 3 : 6
		// Pick actual data point dates whose month index (from first) is a multiple of step
		return portfolioData
			.map(p => p.date)
			.filter(d => {
				const mo = (d.getFullYear() - first.getFullYear()) * 12 + (d.getMonth() - first.getMonth())
				return mo % step === 0
			})
	})()
</script>

<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

	<!-- Header with XIRR badges -->
	<div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
		<h2 class="text-sm font-semibold text-gray-900 dark:text-white">Portfolio vs {benchmarkTicker}</h2>
		<div class="flex items-center gap-5">
			<div class="flex items-center gap-1.5">
				<span class="w-2.5 h-0.5 rounded-full bg-indigo-500 inline-block"></span>
				<span class="text-[11px] text-gray-500 dark:text-gray-400">Portfolio XIRR</span>
				<span class="text-[11px] font-semibold {portfolioXirr === null ? 'text-gray-400' : portfolioXirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}">
					{fmtXirr(portfolioXirr)}
				</span>
			</div>
			{#if benchmarkXirr !== null}
				<div class="flex items-center gap-1.5">
					<span class="w-2.5 h-0.5 rounded-full bg-amber-400 inline-block"></span>
					<span class="text-[11px] text-gray-500 dark:text-gray-400">{benchmarkTicker} XIRR</span>
					<span class="text-[11px] font-semibold {benchmarkXirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}">
						{fmtXirr(benchmarkXirr)}
					</span>
				</div>
			{/if}
		</div>
	</div>

	{#if points.length < 2}
		<div class="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-xs">
			Not enough data to display chart.
		</div>
	{:else}
		<div class="px-4 pb-4 pt-2" style="height: 280px">
			<LineChart
				padding={{ top: 8, left: 72, bottom: 28, right: 16 }}
				x="date"
				y="value"
				series={[
					{
						key: 'portfolio',
						label: 'Portfolio',
						data: portfolioData,
						value: 'value',
						color: '#6366f1',
					},
					...(benchmarkData.length > 1 ? [{
						key: 'benchmark',
						label: `${benchmarkTicker} (same cash flows)`,
						data: benchmarkData,
						value: 'value',
						color: '#fbbf24',
						props: { class: '[stroke-dasharray:4_2]' },
					}] : []),
				]}
				legend={false}
				points={false}
				props={{
					xAxis: {
						placement: 'bottom',
						format: xAxisFormat,
						ticks: xTicks,
						rule: true,
						classes: { label: 'text-[10px] fill-gray-400 dark:fill-gray-500' },
					},
					yAxis: {
						placement: 'left',
						format: yAxisFormat,
						rule: true,
						classes: { label: 'text-[10px] fill-gray-400 dark:fill-gray-500' },
					},
					grid: { class: 'stroke-gray-100 dark:stroke-gray-700/60' },
					tooltip: {
						header: { format: tooltipHeaderFormat },
						item: { format: tooltipItemFormat },
					},
				}}
			/>
		</div>
	{/if}

</div>
