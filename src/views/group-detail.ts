import type { I18nManager } from '@/api';
import { Role } from '@/api';
import type {
	BlockedMember,
	GroupInfo,
	GroupMember,
	GroupMemberPage,
	PendingMember,
} from '../services/GroupService';
import { renderLayout } from './layout';
import { escapeAttr, escapeHtml, escapeUrl } from '../utils/html';
import { badge, buttonClass, dataTable, kvList, pageHeader, panel } from './ui';

export interface GroupDetailAccess {
	isBotAdmin: boolean;
	actorRole: Role;
	canManageSettings: boolean;
	canManageVirtualDeputies: boolean;
}

export function renderInviteCard(
	threadId: string,
	savedLink?: string,
	canManageSettings = true,
): string {
	const enableButton = `
		<button hx-post="/groups/${escapeAttr(threadId)}/link/enable" hx-swap="outerHTML" hx-target="#invite-card" class="${buttonClass()} btn-small">
			${savedLink ? 'Regenerate' : 'Enable'}
		</button>`;
	const refreshButton = savedLink
		? `
		<button hx-post="/groups/${escapeAttr(threadId)}/link/refresh" hx-swap="outerHTML" hx-target="#invite-card" class="${buttonClass()} btn-small">
			Refresh
		</button>`
		: '';
	const disableButton = savedLink
		? `
		<button hx-post="/groups/${escapeAttr(threadId)}/link/disable" hx-swap="outerHTML" hx-target="#invite-card" class="${buttonClass('warning')} btn-small">
			Disable
		</button>`
		: '';
	const controls = canManageSettings
		? `${enableButton}
			${refreshButton}
			${disableButton}`
		: '<span class="muted">View only</span>';
	const headerActions = savedLink
		? `<button type="button" class="${buttonClass('ghost')} btn-small" data-copy="${escapeAttr(savedLink)}" data-label="Copy">Copy</button>
			${badge('Enabled', 'success')}`
		: badge('Disabled or unknown');

	const body = savedLink
		? `
			<div class="invite-link-box">
				<p class="subtle">Current link</p>
				<a class="invite-link-text" href="${escapeUrl(savedLink)}" title="${escapeAttr(savedLink)}" target="_blank" rel="noreferrer">${escapeHtml(savedLink)}</a>
			</div>
			<div class="invite-actions">${controls}</div>`
		: `
			<div class="invite-link-box">
				<p class="subtle">Current link</p>
				<span class="invite-link-text muted">No saved invite link.</span>
			</div>
			<div class="invite-actions">${controls}</div>`;

	return panel('Invite link', body, {
		id: 'invite-card',
		className: 'invite-panel',
		actions: headerActions,
	});
}

export function renderGroupDetail(
	group: GroupInfo,
	memberPage: GroupMemberPage,
	blockedMembers: BlockedMember[],
	pendingMembers: PendingMember[],
	access: GroupDetailAccess,
	i18n: I18nManager,
	lang: string,
	savedLink?: string,
): string {
	const actorRole = getRoleLabelFromLevel(access.actorRole);
	const rows = memberPage.members.map((member) => renderMemberRows(group, member, access)).join('');
	const titleKicker = `<a href="/groups">&larr; Back to groups</a>`;
	const memberTools = renderMemberTools(group.threadId, memberPage);

	const content = `
		${pageHeader(
			group.name,
			`${group.memberCount} members | Your access: ${actorRole}`,
			titleKicker,
		)}
		<div class="section-stack">
			<div class="layout-grid grid-3 group-summary-grid">
				${panel(
					'Group info',
					kvList([
						{ label: 'Thread ID', value: `<code>${escapeHtml(group.threadId)}</code>` },
						{ label: 'Creator', value: `<code>${escapeHtml(group.creatorId)}</code>` },
						{ label: 'Deputies', value: String(group.adminIds.length) },
					]),
				)}
				${panel(
					'Change name',
					access.canManageSettings
						? `
							<form hx-post="/groups/${escapeAttr(group.threadId)}/name" hx-swap="innerHTML" hx-target="#name-result" class="inline-form">
								<input type="text" name="name" placeholder="New name" required>
								<button type="submit" class="${buttonClass('primary')}">Save</button>
							</form>
							<div id="name-result"></div>`
						: `<p class="muted">You cannot change this group.</p>`,
				)}
				${renderInviteCard(group.threadId, savedLink, access.canManageSettings)}
			</div>

			<div id="action-result"></div>

			${renderManagementPanels(group.threadId, access, pendingMembers, blockedMembers)}

			${panel(
				'Members',
				dataTable(
					[
						{ label: 'User' },
						{ label: 'Role' },
						{ label: 'Actions', className: 'col-actions' },
					],
					rows,
					'No members found',
					'members-table',
				),
				{
					description: `${memberPage.filteredTotal} shown of ${memberPage.total} total`,
					actions: memberTools,
					compact: true,
				},
			)}
		</div>
	`;

	return renderLayout(group.name, content, i18n, lang, access.isBotAdmin, 'groups');
}

function renderMemberRows(
	group: GroupInfo,
	member: GroupMember,
	access: GroupDetailAccess,
): string {
	const role = getRoleLabel(member);
	const actions = renderMemberActions(group.threadId, member, access);
	const avatar = renderAvatar(member);
	const searchText = `${member.displayName} ${member.userId} ${role}`.toLowerCase();

	return `
		<tr data-filter-text="${escapeAttr(searchText)}">
			<td>
				<div class="identity">
					${avatar}
					<div class="identity-meta">
						<div class="identity-name">${escapeHtml(member.displayName)}</div>
						<div class="identity-sub">${escapeHtml(member.userId)}</div>
					</div>
				</div>
			</td>
			<td>${badge(role, getBadgeTone(member))}</td>
			<td class="col-actions">${actions}</td>
		</tr>`;
}

function renderMemberTools(threadId: string, memberPage: GroupMemberPage): string {
	const basePath = `/groups/${escapeAttr(threadId)}`;
	const roleOptions: Array<{ value: GroupMemberPage['role']; label: string }> = [
		{ value: 'all', label: 'All roles' },
		{ value: 'leader', label: 'Leader' },
		{ value: 'deputy', label: 'Deputy' },
		{ value: 'virtualDeputy', label: 'vDeputy' },
		{ value: 'botAdmin', label: 'BotAdmin' },
		{ value: 'bot', label: 'Bot' },
		{ value: 'member', label: 'Member' },
	];

	return `
		<form method="get" action="${basePath}" class="member-toolbar">
			<input type="search" name="q" value="${escapeAttr(memberPage.query)}" placeholder="Search user ID" class="input">
			<select name="role" class="input">
				${roleOptions
					.map(
						(option) =>
							`<option value="${escapeAttr(option.value)}"${option.value === memberPage.role ? ' selected' : ''}>${escapeHtml(option.label)}</option>`,
					)
					.join('')}
			</select>
			<button type="submit" class="${buttonClass()}">Filter</button>
			${renderPagination(basePath, memberPage)}
		</form>`;
}

function renderPagination(basePath: string, memberPage: GroupMemberPage): string {
	const previous = buildMemberPageUrl(basePath, memberPage, memberPage.page - 1);
	const next = buildMemberPageUrl(basePath, memberPage, memberPage.page + 1);

	return `
		<div class="pagination">
			<a class="btn btn-small${memberPage.page <= 1 ? ' is-disabled' : ''}" href="${previous}">Prev</a>
			<span class="pagination-label">${memberPage.page} / ${memberPage.totalPages}</span>
			<a class="btn btn-small${memberPage.page >= memberPage.totalPages ? ' is-disabled' : ''}" href="${next}">Next</a>
		</div>`;
}

function buildMemberPageUrl(basePath: string, memberPage: GroupMemberPage, page: number): string {
	const params = new URLSearchParams();
	if (memberPage.query) params.set('q', memberPage.query);
	if (memberPage.role !== 'all') params.set('role', memberPage.role);
	params.set('page', String(Math.max(1, Math.min(page, memberPage.totalPages))));
	return `${basePath}?${escapeAttr(params.toString())}`;
}

function renderMemberActions(
	threadId: string,
	member: GroupMember,
	access: GroupDetailAccess,
): string {
	const detailsButton = `
		<a
			href="/groups/${escapeAttr(threadId)}/members/${escapeAttr(member.userId)}"
			class="${buttonClass()} btn-small"
		>Details</a>`;

	const actionButtons: string[] = [detailsButton];

	if (member.role === 'member' && access.canManageVirtualDeputies) {
		actionButtons.unshift(`
			<button
				hx-post="/groups/${escapeAttr(threadId)}/deputies/${escapeAttr(member.userId)}/add"
				hx-confirm="Grant vDeputy to ${escapeAttr(member.displayName)}?"
				hx-swap="innerHTML"
				hx-target="#action-result"
				class="${buttonClass('primary')} btn-small"
			>Grant vDeputy</button>`);
	}

	if (member.role === 'virtualDeputy' && access.canManageVirtualDeputies) {
		actionButtons.unshift(`
			<button
				hx-post="/groups/${escapeAttr(threadId)}/deputies/${escapeAttr(member.userId)}/remove"
				hx-confirm="Remove vDeputy from ${escapeAttr(member.displayName)}?"
				hx-swap="innerHTML"
				hx-target="#action-result"
				class="${buttonClass('warning')} btn-small"
			>Remove vDeputy</button>`);
	}

	if (member.canBeModerated && access.canManageSettings) {
		actionButtons.splice(
			1,
			0,
			`
			<button
				hx-post="/groups/${escapeAttr(threadId)}/members/${escapeAttr(member.userId)}/kick"
				hx-confirm="Kick ${escapeAttr(member.displayName)}?"
				hx-swap="innerHTML"
				hx-target="#action-result"
				class="${buttonClass()} btn-small"
			>Kick</button>
			<button
				hx-post="/groups/${escapeAttr(threadId)}/members/${escapeAttr(member.userId)}/ban"
				hx-confirm="Ban ${escapeAttr(member.displayName)}?"
				hx-swap="innerHTML"
				hx-target="#action-result"
				class="${buttonClass('danger')} btn-small"
			>Ban</button>`,
		);
	}

	return `<div class="actions actions-right">${actionButtons.join('')}</div>`;
}

function renderManagementPanels(
	threadId: string,
	access: GroupDetailAccess,
	pendingMembers: PendingMember[],
	blockedMembers: BlockedMember[],
): string {
	if (!access.canManageSettings) return '';

	return `
		<div class="layout-grid grid-2">
			${panel(
				'Add member',
				`
					<form hx-post="/groups/${escapeAttr(threadId)}/members/add" hx-swap="innerHTML" hx-target="#action-result" class="inline-form">
						<input type="text" name="userId" placeholder="User ID" required>
						<button type="submit" class="${buttonClass('primary')}">Add</button>
					</form>`,
			)}
			${renderPendingPanel(threadId, pendingMembers)}
		</div>
		${renderBlockedPanel(threadId, blockedMembers)}
	`;
}

function renderPendingPanel(threadId: string, pendingMembers: PendingMember[]): string {
	const body =
		pendingMembers.length === 0
			? '<p class="muted">No pending join requests.</p>'
			: `<div class="compact-list">
				${pendingMembers
					.map(
						(member) => `
					<div class="compact-row">
						${renderPerson(member)}
						<div class="actions actions-right">
							<button
								hx-post="/groups/${escapeAttr(threadId)}/pending/${escapeAttr(member.userId)}/approve"
								hx-swap="innerHTML"
								hx-target="#action-result"
								class="${buttonClass('primary')} btn-small"
							>Approve</button>
							<button
								hx-post="/groups/${escapeAttr(threadId)}/pending/${escapeAttr(member.userId)}/reject"
								hx-confirm="Reject ${escapeAttr(member.displayName)}?"
								hx-swap="innerHTML"
								hx-target="#action-result"
								class="${buttonClass('danger')} btn-small"
							>Reject</button>
						</div>
					</div>`,
					)
					.join('')}
			</div>`;

	return panel('Join requests', body, { description: `${pendingMembers.length} pending` });
}

function renderBlockedPanel(threadId: string, blockedMembers: BlockedMember[]): string {
	const body =
		blockedMembers.length === 0
			? '<p class="muted">No blocked members.</p>'
			: `<div class="compact-list">
				${blockedMembers
					.map(
						(member) => `
					<div class="compact-row">
						${renderPerson(member)}
						<button
							hx-post="/groups/${escapeAttr(threadId)}/members/${escapeAttr(member.userId)}/unban"
							hx-confirm="Unban ${escapeAttr(member.displayName)}?"
							hx-swap="innerHTML"
							hx-target="#action-result"
							class="${buttonClass()} btn-small"
						>Unban</button>
					</div>`,
					)
					.join('')}
			</div>`;

	return panel('Blocked members', body, { description: `${blockedMembers.length} shown` });
}

function renderPerson(member: Pick<GroupMember, 'displayName' | 'userId' | 'avatar'>): string {
	return `
		<div class="identity">
			${renderPersonAvatar(member)}
			<div class="identity-meta">
				<div class="identity-name">${escapeHtml(member.displayName)}</div>
				<div class="identity-sub">${escapeHtml(member.userId)}</div>
			</div>
		</div>`;
}

function renderPersonAvatar(member: Pick<GroupMember, 'displayName' | 'avatar'>): string {
	if (member.avatar) {
		return `<img src="${escapeUrl(member.avatar)}" alt="" class="avatar">`;
	}

	return `<div class="avatar avatar-fallback">${escapeHtml(member.displayName.charAt(0).toUpperCase())}</div>`;
}

function renderAvatar(member: GroupMember): string {
	if (member.avatar) {
		return `<img src="${escapeUrl(member.avatar)}" alt="" class="avatar">`;
	}

	const label = member.isBot ? 'B' : member.displayName.charAt(0).toUpperCase();
	return `<div class="avatar avatar-fallback">${escapeHtml(label)}</div>`;
}

function getRoleLabel(member: GroupMember): string {
	switch (member.role) {
		case 'botAdmin':
			return 'BotAdmin';
		case 'leader':
			return 'Leader';
		case 'deputy':
			return 'Deputy';
		case 'virtualDeputy':
			return 'vDeputy';
		case 'bot':
			return 'Bot';
		case 'member':
			return 'Member';
	}
}

function getBadgeTone(member: GroupMember): string {
	if (member.role === 'botAdmin') return 'admin';
	if (member.role === 'leader') return 'leader';
	if (member.role === 'deputy') return 'deputy';
	if (member.role === 'virtualDeputy') return 'virtualDeputy';
	if (member.role === 'bot') return 'bot';
	return 'neutral';
}

function getRoleLabelFromLevel(role: Role): string {
	return Role[role] ?? 'Member';
}
