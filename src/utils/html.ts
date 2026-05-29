export function escapeHtml(value: unknown): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function escapeAttr(value: unknown): string {
	return escapeHtml(value).replace(/`/g, '&#96;');
}

export function escapeUrl(value: unknown): string {
	const raw = String(value ?? '');
	if (/^(https?:|data:image\/)/i.test(raw)) return escapeAttr(raw);
	return '';
}

export function toast(type: 'success' | 'error' | 'warning' | 'info', message: string): string {
	const className =
		type === 'success'
			? 'toast-success'
			: type === 'error'
				? 'toast-error'
				: type === 'warning'
					? 'toast-warning'
					: 'toast-info';

	return `<div class="toast ${className}">${escapeHtml(message)}</div>`;
}

export function formatList(values: readonly string[]): string {
	if (values.length === 0) return 'None';
	return values.map((value) => escapeHtml(value)).join(', ');
}
