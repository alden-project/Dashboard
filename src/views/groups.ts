import type { I18nManager } from '@/api';
import type { GroupInfo } from '../services/GroupService';
import { renderLayout } from './layout';
import { escapeAttr, escapeHtml } from '../utils/html';
import { dataTable, pageHeader } from './ui';

export function renderGroups(
	groups: GroupInfo[],
	isAdmin: boolean,
	i18n: I18nManager,
	lang: string,
): string {
	const rows = groups
		.map(
			(group) => `
		<tr>
			<td>
				<a href="/groups/${escapeAttr(group.threadId)}"><strong>${escapeHtml(group.name)}</strong></a>
			</td>
			<td>${group.memberCount}</td>
			<td><code class="mono-pill">${escapeHtml(group.threadId)}</code></td>
			<td class="col-actions">
				<a href="/groups/${escapeAttr(group.threadId)}" class="btn btn-small">Open</a>
			</td>
		</tr>`,
		)
		.join('');
	const table = dataTable(
		[
			{ label: 'Name' },
			{ label: 'Members' },
			{ label: 'Thread ID' },
			{ label: 'Actions', className: 'col-actions' },
		],
		rows,
		'No groups found',
	);

	const content = `
		${pageHeader('Groups', `${groups.length} group${groups.length === 1 ? '' : 's'} tracked`)}
		<section class="panel table-panel">
			<div class="panel-body">${table}</div>
		</section>
	`;

	return renderLayout('Groups', content, i18n, lang, isAdmin, 'groups');
}
