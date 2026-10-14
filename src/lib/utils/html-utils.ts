const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/**
 * Escapes user-entered text for interpolation into HTML strings (sortable-table render
 * functions are output with {@html}).
 */
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const BADGE_TONES = {
	secondary: 'bg-secondary text-secondary-foreground',
	outline: 'border border-border text-foreground'
} as const;

/** A badge for sortable-table render functions (the HTML twin of `<Badge>`). */
export function badgeHtml(label: string, tone: keyof typeof BADGE_TONES = 'secondary'): string {
	return `<span class="inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${BADGE_TONES[tone]}">${escapeHtml(label)}</span>`;
}
