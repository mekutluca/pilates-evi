import Users from '@lucide/svelte/icons/users';

// Unified interface for action items - flexible handler for both menu and table actions
export interface ActionItem {
	label: string;
	handler: (id: number | string | void) => void | Promise<void>;
	class?: string;
	icon?: typeof Users;
}
