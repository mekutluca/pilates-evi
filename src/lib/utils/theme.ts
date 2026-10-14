import { resetMode, setMode } from 'mode-watcher';
import type { Theme } from '$lib/types/Theme';

/** Persists the user's choice; `system` clears it so the OS preference applies. */
export function applyTheme(theme: Theme): void {
	if (theme === 'system') {
		resetMode();
		return;
	}
	setMode(theme);
}
