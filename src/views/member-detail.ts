import type { I18nManager } from '@/api';
import type { GroupInfo, GroupMember } from '../services/GroupService';
import { renderLayout } from './layout';
import type { GroupDetailAccess } from './group-detail';
import { escapeAttr, escapeHtml, escapeUrl, formatList } from '../utils/html';
import { badge, buttonClass, kvList, pageHeader, panel } from './ui';

export function renderGroupMemberDetail(
	group: GroupInfo,
	member: GroupMember,
	permissions: readonly string[],
	access: GroupDetailAccess,
	i18n: I18nManager,
	lang: string,
): string {
	const roleLabel = getRoleLabel(member);
	const roleBadge = badge(roleLabel, getBadgeTone(member));
	const titleKicker = `<a href="/groups/${escapeAttr(group.threadId)}">&larr; Back to group</a>`;

	const content = `
		${pageHeader(
			member.displayName,
			`${roleLabel} in ${group.name}`,
			titleKicker,
		)}
		<div id="action-result"></div>
		<div class="section-stack">
			<div class="member-page-grid">
				${panel(
					'Member profile',
					renderMemberHero(member, roleBadge),
					{ className: 'member-profile-panel' },
				)}
				${panel(
					'Access summary',
					kvList([
						{ label: 'Role', value: roleBadge },
						{
							label: 'Virtual deputy',
							value: member.isVirtualDeputy
								? badge('Enabled', 'virtualDeputy')
								: badge('No', 'neutral'),
						},
						{
							label: 'Moderation',
							value: member.canBeModerated
								? badge('Available', 'success')
								: badge('Protected', 'admin'),
						},
						{ label: 'Permissions', value: `<span class="mono">${formatList(permissions)}</span>` },
					]),
				)}
			</div>

			<div class="layout-grid grid-2">
				${panel(
					'Identity',
					kvList([
						{ label: 'User ID', value: `<code>${escapeHtml(member.userId)}</code>` },
						{ label: 'Group', value: escapeHtml(group.name) },
						{ label: 'Thread ID', value: `<code>${escapeHtml(group.threadId)}</code>` },
					]),
				)}
				${renderMemberActionsPanel(group.threadId, member, access)}
			</div>
		</div>`;

	return renderLayout(member.displayName, content, i18n, lang, access.isBotAdmin, 'groups');
}

function renderMemberHero(member: GroupMember, roleBadge: string): string {
	return `
		<div class="member-hero">
			${renderAvatar(member)}
			<div class="member-hero-main">
				<div class="member-hero-title">
					<h2>${escapeHtml(member.displayName)}</h2>
					${roleBadge}
				</div>
				<p>${escapeHtml(member.userId)}</p>
			</div>
		</div>`;
}

function renderMemberActionsPanel(
	threadId: string,
	member: GroupMember,
	access: GroupDetailAccess,
): string {
	const actions: string[] = [];

	if (member.role === 'member' && access.canManageVirtualDeputies) {
		actions.push(`
			<button
				hx-post="/groups/${escapeAttr(threadId)}/deputies/${escapeAttr(member.userId)}/add"
				hx-confirm="Grant vDeputy to ${escapeAttr(member.displayName)}?"
				hx-swap="innerHTML"
				hx-target="#action-result"
				class="${buttonClass('primary')}"
			>Grant vDeputy</button>`);
	}

	if (member.role === 'virtualDeputy' && access.canManageVirtualDeputies) {
		actions.push(`
			<button
				hx-post="/groups/${escapeAttr(threadId)}/deputies/${escapeAttr(member.userId)}/remove"
				hx-confirm="Remove vDeputy from ${escapeAttr(member.displayName)}?"
				hx-swap="innerHTML"
				hx-target="#action-result"
				class="${buttonClass('warning')}"
			>Remove vDeputy</button>`);
	}

	if (member.canBeModerated && access.canManageSettings) {
		actions.push(`
			<button
				hx-post="/groups/${escapeAttr(threadId)}/members/${escapeAttr(member.userId)}/kick"
				hx-confirm="Kick ${escapeAttr(member.displayName)}?"
				hx-swap="innerHTML"
				hx-target="#action-result"
				class="${buttonClass()}"
			>Kick</button>
			<button
				hx-post="/groups/${escapeAttr(threadId)}/members/${escapeAttr(member.userId)}/ban"
				hx-confirm="Ban ${escapeAttr(member.displayName)}?"
				hx-swap="innerHTML"
				hx-target="#action-result"
				class="${buttonClass('danger')}"
			>Ban</button>`);
	}

	const body =
		actions.length > 0
			? `<div class="actions member-page-actions">${actions.join('')}</div>`
			: '<p class="muted">No available actions for this member.</p>';

	return panel('Actions', body);
}

function renderAvatar(member: GroupMember): string {
	if (member.avatar) {
		return `<img src="${escapeUrl(member.avatar)}" alt="" class="member-hero-avatar">`;
	}

	const label = member.isBot ? 'B' : member.displayName.charAt(0).toUpperCase();
	return `<div class="member-hero-avatar avatar-fallback">${escapeHtml(label)}</div>`;
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
