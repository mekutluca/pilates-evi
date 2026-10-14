import Sun from '@lucide/svelte/icons/sun';
import Moon from '@lucide/svelte/icons/moon';
import Monitor from '@lucide/svelte/icons/monitor';
import type { Component } from 'svelte';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeOption {
	value: Theme;
	label: string;
	icon: Component<{ size?: number | string; class?: string }>;
}

export const themeOptions: ThemeOption[] = [
	{ value: 'light', label: 'Aydınlık', icon: Sun },
	{ value: 'dark', label: 'Karanlık', icon: Moon },
	{ value: 'system', label: 'Sistem', icon: Monitor }
];
