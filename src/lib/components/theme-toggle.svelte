<script lang="ts">
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import { userPrefersMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { themeOptions } from '$lib/types/Theme';
	import { applyTheme } from '$lib/utils/theme';
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button variant="ghost" size="icon" {...props}>
				<Sun class="size-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
				<Moon
					class="absolute size-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
				/>
				<span class="sr-only">Tema değiştir</span>
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<!-- Radio items: screen readers hear which theme is on -->
		<DropdownMenu.RadioGroup
			aria-label="Tema"
			value={userPrefersMode.current}
			onValueChange={(value) => {
				const option = themeOptions.find((o) => o.value === value);
				if (option) applyTheme(option.value);
			}}
		>
			{#each themeOptions as option (option.value)}
				<DropdownMenu.RadioItem value={option.value}>
					<option.icon class="size-4" />
					{option.label}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
