/**
 * The latest value of a streamed load promise, kept per key. While a new key loads (e.g. the
 * next week) `current` is undefined, so the page shows its skeleton; while the same key
 * reloads (e.g. after an action) the previous value stays on screen. A load can resolve to
 * null to mean "failed". Call during component setup.
 */
export function streamed<T>(
	promise: () => Promise<T>,
	key: () => string
): { readonly current: T | undefined } {
	let loaded = $state.raw<{ key: string; value: T } | null>(null);

	$effect(() => {
		const pending = promise();
		const pendingKey = key();
		let stale = false;
		pending.then((value) => {
			if (!stale) loaded = { key: pendingKey, value };
		});
		return () => {
			stale = true;
		};
	});

	return {
		get current() {
			return loaded && loaded.key === key() ? loaded.value : undefined;
		}
	};
}
