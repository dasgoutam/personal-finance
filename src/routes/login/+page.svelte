<script lang="ts">
	import type { ActionData } from './$types';
	export let form: ActionData;
</script>

<svelte:head>
	<title>Sign in — Personal Finance</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
	<div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
		<h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">Sign in</h1>
		<p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Personal Finance Dashboard</p>

		{#if form?.error}
			<div class="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
				{form.error}
			</div>
		{/if}

		<form method="POST" class="space-y-4">
			<div>
				<label for="username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
				<input id="username" name="username" type="text" required autocomplete="username"
					value={form?.username ?? ''}
					class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
			</div>
			<div>
				<label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
				<input id="password" name="password" type="password" required autocomplete="current-password"
					class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
			</div>
			<button type="submit"
				class="w-full rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors">
				Sign in
			</button>
		</form>
	</div>
</div>
