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
