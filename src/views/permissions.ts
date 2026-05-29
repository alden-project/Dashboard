import type { I18nManager } from '@/api';
import type { PermissionNode } from '../services/BotService';
import { renderLayout } from './layout';
import { escapeHtml } from '../utils/html';
import { badge, buttonClass, codePill, dataTable, pageHeader, panel } from './ui';

export function renderPermissions(
	nodes: PermissionNode[],
	i18n: I18nManager,
	lang: string,
): string {
	const rows = nodes
		.map(
			(node) => `
		<tr>
			<td>${codePill(node.node)}</td>
			<td>${badge(node.levelName, getLevelTone(node.level))}</td>
		</tr>`,
		)
		.join('');

	const content = `
		${pageHeader('Permissions', 'Manage permission nodes and user access')}
		<div id="perm-result"></div>
		<div class="layout-grid grid-2">
			${permissionForm('Grant permission', '/permissions/grant', 'Grant', 'primary', [
				{ name: 'userId', placeholder: 'User ID' },
				{ name: 'node', placeholder: 'Permission node (e.g. dashboard.admin)' },
			])}
			${permissionForm('Revoke permission', '/permissions/revoke', 'Revoke', 'secondary', [
				{ name: 'userId', placeholder: 'User ID' },
				{ name: 'node', placeholder: 'Permission node' },
			])}
			${permissionForm('Add virtual deputy', '/permissions/deputy/add', 'Add Deputy', 'primary', [
				{ name: 'threadId', placeholder: 'Group Thread ID' },
				{ name: 'userId', placeholder: 'User ID' },
			])}
			${permissionForm(
				'Remove virtual deputy',
				'/permissions/deputy/remove',
				'Remove Deputy',
				'secondary',
				[
					{ name: 'threadId', placeholder: 'Group Thread ID' },
					{ name: 'userId', placeholder: 'User ID' },
				],
			)}
		</div>
		${panel(
			'Permission nodes',
			dataTable(
				[
					{ label: 'Node' },
					{ label: 'Required level' },
				],
				rows,
				'No permission nodes',
			),
			{ description: `${nodes.length} total`, compact: true },
		)}
	`;

	return renderLayout('Permissions', content, i18n, lang, true, 'permissions');
}

function permissionForm(
	title: string,
	action: string,
	buttonLabel: string,
	buttonVariant: 'primary' | 'secondary',
	fields: Array<{ name: string; placeholder: string }>,
): string {
	const body = `
		<form hx-post="${action}" hx-swap="innerHTML" hx-target="#perm-result" class="field-stack">
			${fields
				.map(
					(field) => `
				<input type="text" name="${field.name}" placeholder="${escapeHtml(field.placeholder)}" required>`,
				)
				.join('')}
			<button type="submit" class="${buttonClass(buttonVariant)} btn-block">${escapeHtml(buttonLabel)}</button>
		</form>`;

	return panel(title, body);
}

function getLevelTone(level: number): string {
	if (level >= 3) return 'admin';
	if (level === 2) return 'virtualDeputy';
	if (level === 1) return 'deputy';
	return 'neutral';
}
