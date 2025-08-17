import { getContext, setContext } from 'svelte';

interface ActionItem {
    label: string;
    handler: () => void;
    class?: string;
    icon?: any;
}

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