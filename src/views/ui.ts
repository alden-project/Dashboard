import { escapeAttr, escapeHtml } from '../utils/html';

export interface NavItem {
	href: string;
	label: string;
	id: string;
	icon: string;
}

export interface PanelOptions {
	id?: string;
	description?: string;
	actions?: string;
	className?: string;
	compact?: boolean;
}

export interface MetricCard {
	label: string;
	value: string;
	icon?: string;
}

export interface TableColumn {
	label: string;
	className?: string;
}

export function icon(path: string, className = ''): string {
	return `
		<svg${className ? ` class="${escapeAttr(className)}"` : ''} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="${escapeAttr(path)}"/>
		</svg>`;
}

export function pageHeader(title: string, description?: string, kicker?: string): string {
	return `
		<header class="page-header">
			${kicker ? `<div class="page-kicker">${kicker}</div>` : ''}
			<h1 class="page-title">${escapeHtml(title)}</h1>
			${description ? `<p class="page-description">${escapeHtml(description)}</p>` : ''}
		</header>`;
}

export function panel(title: string, body: string, options: PanelOptions = {}): string {
	const classes = ['panel'];
	if (options.compact) classes.push('panel-compact');
	if (options.className) classes.push(options.className);

	return `
		<section${options.id ? ` id="${escapeAttr(options.id)}"` : ''} class="${classes.join(' ')}">
			<div class="panel-header">
				<div>
					<h2 class="panel-title">${escapeHtml(title)}</h2>
					${options.description ? `<p class="panel-description">${escapeHtml(options.description)}</p>` : ''}
				</div>
				${options.actions ? `<div class="actions actions-right">${options.actions}</div>` : ''}
			</div>
			<div class="panel-body">${body}</div>
		</section>`;
}

export function metricGrid(cards: MetricCard[], columns = 4): string {
	const gridClass = columns >= 5 ? 'grid-5' : columns === 4 ? 'grid-4' : 'grid-3';
	return `
		<div class="layout-grid ${gridClass}">
			${cards
				.map(
					(card) => `
				<div class="metric-card">
					<div class="metric-top">
						<span class="metric-label">${escapeHtml(card.label)}</span>
						${card.icon ? `<span class="metric-icon">${icon(card.icon)}</span>` : ''}
					</div>
					<div class="metric-value">${card.value}</div>
				</div>`,
				)
				.join('')}
		</div>`;
}

export function dataTable(
	columns: TableColumn[],
	rows: string,
	emptyMessage: string,
	tableId?: string,
): string {
	return `
		<div class="data-table-wrap">
			<table${tableId ? ` id="${escapeAttr(tableId)}"` : ''} class="data-table">
				<thead>
					<tr>
						${columns
							.map(
								(column) =>
									`<th${column.className ? ` class="${escapeAttr(column.className)}"` : ''}>${escapeHtml(column.label)}</th>`,
							)
							.join('')}
					</tr>
				</thead>
				<tbody>
					${rows || `<tr><td colspan="${columns.length}" class="empty-state">${escapeHtml(emptyMessage)}</td></tr>`}
				</tbody>
			</table>
		</div>`;
}

export function kvList(items: Array<{ label: string; value: string }>): string {
	return `
		<div class="kv-list">
			${items
				.map(
					(item) => `
				<div class="kv-row">
					<span class="kv-key">${escapeHtml(item.label)}</span>
					<span class="kv-value">${item.value}</span>
				</div>`,
				)
				.join('')}
		</div>`;
}

export function badge(label: string, tone = 'neutral'): string {
	return `<span class="badge badge-${escapeAttr(tone)}">${escapeHtml(label)}</span>`;
}

export function codePill(value: string): string {
	return `<code class="mono-pill">${escapeHtml(value)}</code>`;
}

export function buttonClass(variant: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost' = 'secondary'): string {
	if (variant === 'primary') return 'btn btn-primary';
	if (variant === 'danger') return 'btn btn-danger';
	if (variant === 'warning') return 'btn btn-warning';
	if (variant === 'ghost') return 'btn btn-ghost';
	return 'btn';
}

export function progressBar(percent: number, alt = false): string {
	const value = Math.max(0, Math.min(100, percent));
	return `
		<div class="progress">
			<div class="progress-fill${alt ? ' alt' : ''}" style="width: ${value}%"></div>
		</div>`;
}
