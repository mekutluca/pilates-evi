// Prop helper types shared by the shadcn-svelte primitives in $lib/components/ui.
// The `T extends object` wrapper keeps the conditionals distributive over unions.
export type WithoutChild<T> = T extends object
	? 'child' extends keyof T
		? Omit<T, 'child'>
		: T
	: T;
export type WithoutChildren<T> = T extends object
	? 'children' extends keyof T
		? Omit<T, 'children'>
		: T
	: T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
