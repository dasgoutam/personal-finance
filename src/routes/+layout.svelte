<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	let dark = false;

	onMount(() => {
		dark = localStorage.getItem('theme') === 'dark' ||
			(!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.classList.toggle('dark', dark);
	});

	function toggleDark() {
		dark = !dark;
		localStorage.setItem('theme', dark ? 'dark' : 'light');
		document.documentElement.classList.toggle('dark', dark);
	}
</script>

{#if data.user}
	<nav class="bg-gray-900 dark:bg-gray-950 text-white px-6 py-4 flex items-center justify-between shadow-sm border-b border-gray-800">
		<a href="/dashboard" class="text-lg font-bold tracking-tight">Personal Finance</a>
		<div class="flex items-center gap-6 text-sm">
			<a href="/dashboard" class="text-gray-300 hover:text-white transition-colors">Dashboard</a>
			<a href="/transactions" class="text-gray-300 hover:text-white transition-colors">Transactions</a>
			<a href="/manage" class="text-gray-300 hover:text-white transition-colors">Manage</a>
			<button type="button" on:click={toggleDark}
				class="text-gray-400 hover:text-white transition-colors"
				title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
				{#if dark}
					<!-- Sun icon -->
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
					</svg>
				{:else}
					<!-- Moon icon -->
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
					</svg>
				{/if}
			</button>
			<form method="POST" action="/logout">
				<button type="submit" class="text-gray-300 hover:text-white transition-colors cursor-pointer">
					Log out
				</button>
			</form>
		</div>
	</nav>
{/if}

<main class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<slot />
</main>
