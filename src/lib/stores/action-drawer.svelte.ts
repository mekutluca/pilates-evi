import { getContext, setContext } from 'svelte';
import type { ActionItem } from '$lib/types/ActionItem';

interface ActionDrawerContext {
	openDrawer: (actions: ActionItem[]) => void;
}

const ACTION_DRAWER_KEY = Symbol('action-drawer');

export function setActionDrawerContext(context: ActionDrawerContext) {
	setContext(ACTION_DRAWER_KEY, context);
}

export function getActionDrawerContext(): ActionDrawerContext {
	return getContext(ACTION_DRAWER_KEY);
}
