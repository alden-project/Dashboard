import { Hono } from 'hono';
import type { Context } from 'hono';
import type Main from '../main';
import { expireDashboardSession, requireAuth } from '../auth/middleware';
import { renderGroups } from '../views/groups';
import { renderGroupDetail, renderInviteCard } from '../views/group-detail';
import { renderGroupMemberDetail } from '../views/member-detail';
import type { GroupMember, GroupMemberRoleFilter } from '../services/GroupService';
import type { DashboardGroupAccess } from '../services/DashboardAccessService';
import {
	canGrantVirtualDeputy,
	canManageGroupSettings,
	canManageVirtualDeputies,
	canModerateMember,
	canRevokeVirtualDeputy,
} from '../auth/access';
import { toast } from '../utils/html';

export function createGroupRoutes(plugin: Main): Hono {
	const app = new Hono();

	app.use('/groups/*', requireAuth);

	app.get('/groups', async (c) => {
		const session = c.get('session')!;
		const scope = await plugin.accessService.resolveSessionScope(session, { refresh: true });
		if (!scope) return expireDashboardSession(c, plugin);

		const groups = await plugin.groupService.getGroupsInfo(scope.groupIds);

		return c.html(renderGroups(groups, scope.isBotAdmin, plugin.i18n!, plugin.bot.config.LANGUAGE));
	});

	app.get('/groups/:id', async (c) => {
		const threadId = c.req.param('id');
		const access = await getGroupAccess(c, plugin, threadId);
		if (!access) return c.text('Forbidden', 403);

		const group = await plugin.groupService.getGroupInfo(threadId);
		if (!group) return c.text('Group not found', 404);

		const canManageSettings = canManageGroupSettings(access.actorRole, access.isBotAdmin);
		const memberOptions = getMemberListOptions(c);
		const [memberPage, blockedMembers, pendingMembers] = await Promise.all([
			plugin.groupService.getGroupMembersPage(threadId, group, memberOptions),
			canManageSettings ? plugin.groupService.getBlockedMembers(threadId) : Promise.resolve([]),
			canManageSettings ? plugin.groupService.getPendingMembers(threadId) : Promise.resolve([]),
		]);
		const savedLink = plugin.groupService.getSavedLink(threadId);

		return c.html(
			renderGroupDetail(
				group,
				memberPage,
				blockedMembers,
				pendingMembers,
				{
					isBotAdmin: access.isBotAdmin,
					actorRole: access.actorRole,
					canManageSettings,
					canManageVirtualDeputies: canManageVirtualDeputies(
						access.actorRole,
						access.isBotAdmin,
					),
				},
				plugin.i18n!,
				plugin.bot.config.LANGUAGE,
				savedLink,
			),
		);
	});

	app.post('/groups/:id/members/:uid/kick', async (c) => {
		return handleMemberAction(c, plugin, 'kick');
	});

	app.post('/groups/:id/members/:uid/ban', async (c) => {
		return handleMemberAction(c, plugin, 'ban');
	});

	app.post('/groups/:id/members/:uid/unban', async (c) => {
		return handleMemberAction(c, plugin, 'unban');
	});

	app.post('/groups/:id/members/add', async (c) => {
		const threadId = c.req.param('id');
		const access = await getGroupAccess(c, plugin, threadId);
		if (!access) return c.text('Forbidden', 403);
		if (!canManageGroupSettings(access.actorRole, access.isBotAdmin)) {
			return c.html(toast('error', 'You cannot add members to this group.'), 403);
		}

		const body = await c.req.parseBody();
		const userId = String(body['userId'] ?? '').trim();
		if (!userId) return c.html(toast('error', 'User ID is required'), 400);

		const success = await plugin.groupService.addMember(threadId, userId);
		return c.html(
			success ? toast('success', 'Member added') : toast('error', 'Failed to add member'),
		);
	});

	app.post('/groups/:id/pending/:uid/approve', async (c) => {
		return handlePendingMember(c, plugin, true);
	});

	app.post('/groups/:id/pending/:uid/reject', async (c) => {
		return handlePendingMember(c, plugin, false);
	});

	app.post('/groups/:id/deputies/:uid/add', async (c) => {
		const result = await getTargetAccess(c, plugin);
		if (result instanceof Response) return result;

		if (
			!canGrantVirtualDeputy(result.access.actorRole, result.access.isBotAdmin, result.target)
		) {
			return c.html(
				toast('error', 'Only BotAdmin or group owner can grant vDeputy to members.'),
				403,
			);
		}

		const success = await plugin.botService.addVirtualDeputy(result.threadId, result.userId);
		return c.html(
			success ? toast('success', 'vDeputy added') : toast('error', 'Failed to add vDeputy'),
		);
	});

	app.post('/groups/:id/deputies/:uid/remove', async (c) => {
		const result = await getTargetAccess(c, plugin);
		if (result instanceof Response) return result;

		if (
			!canRevokeVirtualDeputy(
				result.access.actorRole,
				result.access.isBotAdmin,
				result.target,
			)
		) {
			return c.html(
				toast('error', 'Only BotAdmin or group owner can revoke vDeputy access.'),
				403,
			);
		}

		const success = await plugin.botService.removeVirtualDeputy(result.threadId, result.userId);
		return c.html(
			success
				? toast('success', 'vDeputy removed')
				: toast('error', 'Failed to remove vDeputy'),
		);
	});

	app.post('/groups/:id/name', async (c) => {
		const threadId = c.req.param('id');
		const access = await getGroupAccess(c, plugin, threadId);
		if (!access) return c.text('Forbidden', 403);
		if (!canManageGroupSettings(access.actorRole, access.isBotAdmin)) {
			return c.html(toast('error', 'You cannot change this group.'), 403);
		}

		const body = await c.req.parseBody();
		const name = String(body['name'] ?? '').trim();
		if (!name) return c.html(toast('error', 'Group name is required'), 400);

		const success = await plugin.groupService.changeName(threadId, name);
		return c.html(
			success
				? toast('success', 'Group name changed')
				: toast('error', 'Failed to change group name'),
		);
	});

	app.post('/groups/:id/link/enable', async (c) => {
		return handleInviteLink(c, plugin, 'enable');
	});

	app.post('/groups/:id/link/refresh', async (c) => {
		return handleInviteLink(c, plugin, 'refresh');
	});

	app.post('/groups/:id/link/disable', async (c) => {
		return handleInviteLink(c, plugin, 'disable');
	});

	app.get('/groups/:id/members/:uid', async (c) => {
		return renderMemberDetailPage(c, plugin);
	});

	app.get('/groups/:id/members/:uid/detail', async (c) => {
		const threadId = encodeURIComponent(c.req.param('id'));
		const userId = encodeURIComponent(c.req.param('uid'));
		return c.redirect(`/groups/${threadId}/members/${userId}`);
	});

	return app;
}

async function renderMemberDetailPage(c: Context, plugin: Main): Promise<Response> {
	const result = await getTargetAccess(c, plugin);
	if (result instanceof Response) return result;

	const group = await plugin.groupService.getGroupInfo(result.threadId);
	if (!group) return c.text('Group not found', 404);

	const perms = plugin.bot.permissionManager.getUserPermissions(result.userId);
	const access = {
		isBotAdmin: result.access.isBotAdmin,
		actorRole: result.access.actorRole,
		canManageSettings: canManageGroupSettings(
			result.access.actorRole,
			result.access.isBotAdmin,
		),
		canManageVirtualDeputies: canManageVirtualDeputies(
			result.access.actorRole,
			result.access.isBotAdmin,
		),
	};

	return c.html(
		renderGroupMemberDetail(
			group,
			result.target,
			perms,
			access,
			plugin.i18n!,
			plugin.bot.config.LANGUAGE,
		),
	);
}

async function handleMemberAction(
	c: Context,
	plugin: Main,
	action: 'kick' | 'ban' | 'unban',
): Promise<Response> {
	if (action === 'unban') {
		const result = await getGroupActionAccess(c, plugin);
		if (result instanceof Response) return result;

		const success = await plugin.groupService.unbanMember(result.threadId, result.userId);
		return c.html(
			success
				? toast('success', getActionSuccessMessage(action))
				: toast('error', getActionFailureMessage(action)),
		);
	}

	const result = await getTargetAccess(c, plugin);
	if (result instanceof Response) return result;

	if (!canModerateMember(result.access.actorRole, result.access.isBotAdmin, result.target)) {
		return c.html(toast('error', 'This action is only allowed against normal members.'), 403);
	}

	const success =
		action === 'kick'
			? await plugin.groupService.kickMember(result.threadId, result.userId)
			: await plugin.groupService.banMember(result.threadId, result.userId);

	if (success && isMemberDetailReferer(c, result.threadId, result.userId)) {
		c.header('HX-Redirect', `/groups/${encodeURIComponent(result.threadId)}`);
	}

	return c.html(
		success
			? toast('success', getActionSuccessMessage(action))
			: toast('error', getActionFailureMessage(action)),
	);
}

async function handlePendingMember(
	c: Context,
	plugin: Main,
	isApprove: boolean,
): Promise<Response> {
	const result = await getGroupActionAccess(c, plugin);
	if (result instanceof Response) return result;

	const success = await plugin.groupService.reviewPendingMember(
		result.threadId,
		result.userId,
		isApprove,
	);

	return c.html(
		success
			? toast('success', isApprove ? 'Join request approved' : 'Join request rejected')
			: toast('error', isApprove ? 'Failed to approve request' : 'Failed to reject request'),
	);
}

async function handleInviteLink(
	c: Context,
	plugin: Main,
	action: 'enable' | 'refresh' | 'disable',
): Promise<Response> {
	const threadId = c.req.param('id');
	const access = await getGroupAccess(c, plugin, threadId);
	if (!access) return c.text('Forbidden', 403);
	if (!canManageGroupSettings(access.actorRole, access.isBotAdmin)) {
		return c.html(
			renderInviteCard(threadId, plugin.groupService.getSavedLink(threadId), false),
		);
	}

	if (action === 'disable') {
		await plugin.groupService.disableLink(threadId);
		return c.html(renderInviteCard(threadId, undefined, true));
	}

	const link = await plugin.groupService.enableLink(threadId);
	const savedLink = link || plugin.groupService.getSavedLink(threadId);
	return c.html(renderInviteCard(threadId, savedLink, true));
}

async function getTargetAccess(
	c: Context,
	plugin: Main,
): Promise<
	| Response
	| {
			access: DashboardGroupAccess;
			threadId: string;
			userId: string;
			target: GroupMember;
	  }
> {
	const threadId = c.req.param('id');
	const userId = c.req.param('uid');
	const access = await getGroupAccess(c, plugin, threadId);
	if (!access) return c.text('Forbidden', 403);

	const target = await plugin.groupService.getGroupMember(threadId, userId);
	if (!target) return c.html(toast('error', 'Member not found'), 404);

	return { access, threadId, userId, target };
}

async function getGroupActionAccess(
	c: Context,
	plugin: Main,
): Promise<
	| Response
	| {
			access: DashboardGroupAccess;
			threadId: string;
			userId: string;
	  }
> {
	const threadId = c.req.param('id');
	const userId = c.req.param('uid');
	const access = await getGroupAccess(c, plugin, threadId);
	if (!access) return c.text('Forbidden', 403);
	if (!canManageGroupSettings(access.actorRole, access.isBotAdmin)) {
		return c.html(toast('error', 'You cannot manage this group.'), 403);
	}

	return { access, threadId, userId };
}

async function getGroupAccess(
	c: Context,
	plugin: Main,
	threadId: string,
): Promise<DashboardGroupAccess | null> {
	const session = c.get('session');
	if (!session) return null;

	return plugin.accessService.resolveGroupAccess(session, threadId, { refresh: true });
}

function isMemberDetailReferer(c: Context, threadId: string, userId: string): boolean {
	const referer = c.req.header('referer');
	if (!referer) return false;

	try {
		const path = decodeURIComponent(new URL(referer).pathname);
		return path === `/groups/${threadId}/members/${userId}`;
	} catch {
		return false;
	}
}

function getMemberListOptions(c: Context): {
	page: number;
	pageSize: number;
	role: GroupMemberRoleFilter;
	query: string;
} {
	return {
		page: getPositiveQueryInt(c, 'page', 1),
		pageSize: 24,
		role: getRoleQuery(getQueryParam(c, 'role')),
		query: String(getQueryParam(c, 'q') ?? '').trim(),
	};
}

function getPositiveQueryInt(c: Context, name: string, fallback: number): number {
	const parsed = Number(getQueryParam(c, name));
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return Math.floor(parsed);
}

function getQueryParam(c: Context, name: string): string | undefined {
	return new URL(c.req.url).searchParams.get(name) ?? undefined;
}

function getRoleQuery(value: string | undefined): GroupMemberRoleFilter {
	if (
		value === 'botAdmin' ||
		value === 'leader' ||
		value === 'deputy' ||
		value === 'virtualDeputy' ||
		value === 'bot' ||
		value === 'member'
	) {
		return value;
	}
	return 'all';
}

function getActionSuccessMessage(action: 'kick' | 'ban' | 'unban'): string {
	if (action === 'kick') return 'Member kicked';
	if (action === 'ban') return 'Member banned';
	return 'Member unbanned';
}

function getActionFailureMessage(action: 'kick' | 'ban' | 'unban'): string {
	if (action === 'kick') return 'Failed to kick member';
	if (action === 'ban') return 'Failed to ban member';
	return 'Failed to unban member';
}
