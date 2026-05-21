<script lang="ts">
	import { fmt } from '$lib/utils/format'

	type AccountBalance = {
		id: number
		name: string
		currency: string
		typeName: string
		typeCategory: string
		commoditySymbol?: string | null
		balance: number
		costBasis?: number
	}

	export let accounts: AccountBalance[]

	// Curated palette: distinct, readable, works light + dark
	const SEGMENT_COLORS = [
		'#4f86c6', // steel blue
		'#f4845f', // coral
		'#56b08b', // sage green
		'#e8b84b', // warm gold
		'#9b7fe8', // soft violet
		'#4fc4cf', // teal
		'#e06b8b', // rose
		'#7ebd5e', // grass green
		'#d4845a', // terracotta
		'#5c9ecf', // sky
	]

	let selectedType: string | null = null
	let animating = false

	$: assetAccounts = accounts.filter(a => a.typeCategory === 'asset')
	$: totalPortfolio = assetAccounts.reduce((sum, a) => sum + a.balance, 0)

	type Segment = {
		typeName: string
		total: number
		percentage: number
		fill: string
		accounts: AccountBalance[]
	}

	$: segments = ((): Segment[] => {
		const map = new Map<string, AccountBalance[]>()
		for (const a of assetAccounts) {
			if (!map.has(a.typeName)) map.set(a.typeName, [])
			map.get(a.typeName)!.push(a)
		}
		return Array.from(map.entries())
			.map(([typeName, accts], i) => {
				const total = accts.reduce((s, a) => s + a.balance, 0)
				return {
					typeName,
					total,
					percentage: totalPortfolio > 0 ? (total / totalPortfolio) * 100 : 0,
					fill: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
					accounts: accts,
				}
			})
			.sort((a, b) => b.total - a.total)
	})()

	$: drillSegment = selectedType ? segments.find(s => s.typeName === selectedType) ?? null : null

	// SVG pie chart — full pie (no hole), larger
	const CX = 100, CY = 100, R = 92, GAP = 0.8

	function polarToXY(angleDeg: number, radius: number) {
		const rad = ((angleDeg - 90) * Math.PI) / 180
		return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) }
	}

	function slicePath(startAngle: number, endAngle: number): string {
		const sweep = endAngle - startAngle
		if (sweep >= 360) {
			const t = polarToXY(0, R)
			const b = polarToXY(180, R)
			return `M ${t.x} ${t.y} A ${R} ${R} 0 1 1 ${b.x} ${b.y} A ${R} ${R} 0 1 1 ${t.x} ${t.y} Z`
		}
		const large = sweep > 180 ? 1 : 0
		const s = polarToXY(startAngle, R)
		const e = polarToXY(endAngle, R)
		return `M ${CX} ${CY} L ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y} Z`
	}

	type ArcSegment = {
		path: string
		midAngle: number
		labelX: number
		labelY: number
		pct: string
		segment: Segment
	}

	$: arcs = ((): ArcSegment[] => {
		if (segments.length === 0) return []
		const gapAngle = segments.length > 1 ? GAP : 0
		let cursor = 0
		return segments.map(seg => {
			const span = (seg.percentage / 100) * 360 - gapAngle
			const start = cursor
			const end = cursor + span
			cursor += span + gapAngle
			const mid = start + span / 2
			// Label at 62% radius so it sits inside the slice
			const lp = polarToXY(mid, R * 0.62)
			return {
				path: slicePath(start, end),
				midAngle: mid,
				labelX: lp.x,
				labelY: lp.y,
				pct: seg.percentage.toFixed(1),
				segment: seg,
			}
		})
	})()

	function handleSegmentClick(typeName: string) {
		if (animating) return
		animating = true
		selectedType = typeName
		setTimeout(() => (animating = false), 300)
	}

	function handleBack() {
		if (animating) return
		animating = true
		selectedType = null
		setTimeout(() => (animating = false), 300)
	}

	function unrealisedPnl(acct: AccountBalance): number | null {
		if (acct.costBasis === undefined || acct.costBasis === null) return null
		return acct.balance - acct.costBasis
	}
</script>

<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">

	<!-- Header -->
	<div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 min-h-[44px]">
		{#if selectedType}
			<button
				on:click={handleBack}
				class="p-1 -ml-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
				aria-label="Back to portfolio"
			>
				<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
				</svg>
			</button>
			<nav class="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
				<button
					on:click={handleBack}
					class="hover:text-gray-700 dark:hover:text-gray-200 transition-colors font-medium"
				>Portfolio</button>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
				</svg>
				<span class="text-gray-700 dark:text-gray-200 font-semibold">{selectedType}</span>
			</nav>
		{:else}
			<h2 class="text-sm font-semibold text-gray-900 dark:text-white">Portfolio Breakdown</h2>
			<span class="ml-auto text-sm font-bold tabular-nums text-gray-900 dark:text-white">{fmt(totalPortfolio, 'EUR')}</span>
		{/if}
	</div>

	<!-- Body -->
	<div
		class="flex-1 transition-opacity duration-300 ease-in-out"
		class:opacity-0={animating}
		class:opacity-100={!animating}
	>
		{#if assetAccounts.length === 0}
			<div class="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-xs">
				No asset accounts found.
			</div>

		{:else if !selectedType}
			<!-- Pie view -->
			<div class="flex flex-col items-center gap-3 px-4 py-4">

				<!-- SVG Pie -->
				<div class="relative">
					<svg width="200" height="200" viewBox="0 0 200 200" class="overflow-visible drop-shadow-sm">
						{#each arcs as arc}
							<!-- svelte-ignore a11y-click-events-have-key-events -->
							<!-- svelte-ignore a11y-no-static-element-interactions -->
							<path
								d={arc.path}
								fill={arc.segment.fill}
								class="cursor-pointer transition-all duration-150 hover:brightness-110 hover:drop-shadow-md"
								on:click={() => handleSegmentClick(arc.segment.typeName)}
							>
								<title>{arc.segment.typeName}: {arc.pct}%</title>
							</path>
						{/each}

						<!-- % + name labels inside slices (only if segment is large enough) -->
						{#each arcs as arc}
							{#if arc.segment.percentage >= 12}
								<text
									x={arc.labelX}
									y={arc.labelY - 5}
									text-anchor="middle"
									dominant-baseline="middle"
									font-size="9"
									font-weight="700"
									fill="white"
									class="pointer-events-none select-none"
									style="text-shadow: 0 1px 2px rgba(0,0,0,0.4)"
								>{arc.pct}%</text>
								<text
									x={arc.labelX}
									y={arc.labelY + 7}
									text-anchor="middle"
									dominant-baseline="middle"
									font-size="7.5"
									font-weight="500"
									fill="rgba(255,255,255,0.85)"
									class="pointer-events-none select-none"
								>{arc.segment.typeName}</text>
							{:else if arc.segment.percentage >= 6}
								<text
									x={arc.labelX}
									y={arc.labelY}
									text-anchor="middle"
									dominant-baseline="middle"
									font-size="8.5"
									font-weight="700"
									fill="white"
									class="pointer-events-none select-none"
								>{arc.pct}%</text>
							{/if}
						{/each}
					</svg>

					</div>

				<!-- Legend: side-by-side with pie -->
				<div class="flex flex-wrap gap-x-4 gap-y-1.5 justify-center pb-1">
					{#each segments as seg}
						<button
							class="flex items-center gap-1.5 group"
							on:click={() => handleSegmentClick(seg.typeName)}
						>
							<span class="w-2 h-2 rounded-sm flex-shrink-0 transition-transform group-hover:scale-125" style="background:{seg.fill}"></span>
							<span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200 transition-colors">{seg.typeName}</span>
							<span class="text-xs font-semibold tabular-nums" style="color:{seg.fill}">{seg.percentage.toFixed(1)}%</span>
						</button>
					{/each}
				</div>

			</div>

		{:else if drillSegment}
			<!-- Drill-down: account list -->
			<div class="divide-y divide-gray-50 dark:divide-gray-700/50">
				{#each drillSegment.accounts.slice().sort((a, b) => b.balance - a.balance) as acct}
					{@const pnl = unrealisedPnl(acct)}
					{@const pct = totalPortfolio > 0 ? (acct.balance / totalPortfolio) * 100 : 0}
					<div class="px-4 py-3 grid gap-x-3 gap-y-0.5" style="grid-template-columns: 1fr auto">
						<span class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{acct.name}</span>
						<span class="text-xs font-semibold tabular-nums text-gray-900 dark:text-white text-right row-span-2 self-center">{fmt(acct.balance, acct.currency)}</span>
						<div class="flex items-center gap-2">
							{#if pnl !== null}
								<span class="text-xs tabular-nums font-medium {pnl >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}">
									{pnl >= 0 ? '+' : ''}{fmt(pnl, acct.currency)}
								</span>
							{/if}
							<span class="text-xs tabular-nums text-gray-400 dark:text-gray-500">{pct.toFixed(1)}% of total</span>
						</div>
					</div>
				{/each}
			</div>

			<div class="px-4 py-2 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
				<span class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
					{drillSegment.typeName} · {drillSegment.percentage.toFixed(1)}% of portfolio
				</span>
				<span class="text-xs font-bold text-gray-900 dark:text-white">{fmt(drillSegment.total, 'EUR')}</span>
			</div>
		{/if}
	</div>

</div>
