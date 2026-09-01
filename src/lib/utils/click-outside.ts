import type { Action } from 'svelte/action';

/**
 * Calls `onOutside` when a click lands outside `node`. Used to dismiss
 * popovers that are not built on bits-ui (e.g. the inline date picker).
 */
export const clickOutside: Action<HTMLElement, () => void> = (node, onOutside) => {
	let handler = onOutside;

	function handleClick(event: MouseEvent) {
		const target = event.target;
		if (target instanceof Node && !node.contains(target)) {
			handler();
		}
	}

	document.addEventListener('click', handleClick);

	return {
		update(next) {
			handler = next;
		},
		destroy() {
			document.removeEventListener('click', handleClick);
		}
	};
};
