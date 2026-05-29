import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Role } from '@/api';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	canGrantVirtualDeputy,
	canModerateMember,
	canRevokeVirtualDeputy,
} from '../src/auth/access';
import { requireAdmin } from '../src/auth/middleware';
import { DashboardAccessService } from '../src/services/DashboardAccessService';
import { GroupTracker } from '../src/services/GroupTracker';
import type Main from '../src/main';
import type { Session } from '../src/auth/SessionManager';
import type { GroupInfo, GroupMember } from '../src/services/GroupService';

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('DashboardAccessService', () => {
	it('resolves BotAdmin with all tracked groups', async () => {
		const plugin = fakePlugin({
			adminIds: ['admin'],
			allGroups: ['g1', 'g2'],
		});

		const scope = await new DashboardAccessService(plugin).resolveUserScope('admin');

		expect(scope).toMatchObject({
			userId: 'admin',
			role: Role.BotAdmin,
			isBotAdmin: true,
			groupIds: ['g1', 'g2'],
		});
	});

	it('rejects normal members with no manageable groups', async () => {
		const plugin = fakePlugin({ manageableGroups: [] });

		await expect(new DashboardAccessService(plugin).resolveUserScope('user')).resolves.toBeNull();
	});

	it('refreshes session scope when manageable groups change', async () => {
		const plugin = fakePlugin({ manageableGroups: ['g2'] });
		const session = {
			token: 'token',
			userId: 'user',
			role: Role.Member,
			groupIds: ['g1'],
			createdAt: 1,
			expiresAt: 2,
			csrfToken: 'csrf',
		};

		const scope = await new DashboardAccessService(plugin).resolveSessionScope(session, {
			refresh: true,
		});

		expect(scope?.groupIds).toEqual(['g2']);
		expect(session.groupIds).toEqual(['g2']);
	});

	it('denies group access below deputy level', async () => {
		const plugin = fakePlugin({ manageableGroups: ['g1'], roleForUser: Role.Member });
		const session = {
			token: 'token',
			userId: 'user',
			role: Role.Member,
			groupIds: ['g1'],
			createdAt: 1,
			expiresAt: 2,
			csrfToken: 'csrf',
		};

		await expect(
			new DashboardAccessService(plugin).resolveGroupAccess(session, 'g1', { refresh: true }),
		).resolves.toBeNull();
	});

	it('does not trust stale BotAdmin session role', async () => {
		const plugin = fakePlugin({
			adminIds: [],
			manageableGroups: [],
		});
		const session = {
			token: 'token',
			userId: 'removed-admin',
			role: Role.BotAdmin,
			groupIds: ['g1'],
			createdAt: 1,
			expiresAt: 2,
			csrfToken: 'csrf',
		};

		await expect(
			new DashboardAccessService(plugin).resolveGroupAccess(session, 'g1', { refresh: true }),
		).resolves.toBeNull();
	});
});

describe('dashboard admin middleware', () => {
	it('does not trust stale BotAdmin session roles', async () => {
		const session: Session = {
			token: 'token',
			userId: 'removed-admin',
			role: Role.BotAdmin,
			groupIds: ['g1'],
			createdAt: 1,
			expiresAt: 2,
			csrfToken: 'csrf',
		};
		const plugin = fakePlugin({
			adminIds: [],
			manageableGroups: [],
		});
		plugin.accessService = {
			resolveSessionScope: vi.fn().mockResolvedValue(null),
		} as unknown as Main['accessService'];
		plugin.sessionManager = {
			revoke: vi.fn().mockResolvedValue(undefined),
		} as unknown as Main['sessionManager'];
		plugin.config = {
			get: vi.fn().mockReturnValue(false),
		} as unknown as Main['config'];

		const app = new Hono();
		app.use('*', async (c, next) => {
			c.set('session', session);
			await next();
		});
		app.use('/ops', requireAdmin(plugin));
		app.get('/ops', (c) => c.text('ok'));

		const response = await app.request('/ops');

		expect(response.status).toBe(403);
		expect(plugin.accessService.resolveSessionScope).toHaveBeenCalledWith(session, {
			refresh: true,
		});
		expect(plugin.sessionManager.revoke).toHaveBeenCalledWith('token');
	});
});

describe('GroupTracker', () => {
	it('removes stale groups after a successful refresh', async () => {
		const dataDir = await makeTempDir();
		const plugin = fakePlugin({ apiGroups: ['g1', 'g2'] });
		const tracker = new GroupTracker(plugin, path.join(dataDir, 'groups.json'));

		await tracker.refreshGroups();
		expect(tracker.getAllGroupIds()).toEqual(['g1', 'g2']);

		plugin.bot.api.getAllGroups = vi.fn().mockResolvedValue({
			gridVerMap: { g2: 1 },
		});

		await tracker.refreshGroups();
		expect(tracker.getAllGroupIds()).toEqual(['g2']);
	});

	it('does not grant dashboard scope from stale virtual deputy groups', async () => {
		const dataDir = await makeTempDir();
		const plugin = fakePlugin({ apiGroups: ['g1'] });
		const tracker = new GroupTracker(plugin, path.join(dataDir, 'groups.json'));

		await tracker.refreshGroups();
		plugin.bot.api.getAllGroups = vi.fn().mockResolvedValue({
			gridVerMap: {},
		});
		await tracker.refreshGroups();

		plugin.bot.permissionManager.isVirtualDeputy = vi.fn(
			(threadId: string, userId: string) => threadId === 'g1' && userId === 'user',
		);

		await expect(tracker.getManageableGroupsForUser('user')).resolves.toEqual([]);
	});

	it('requires virtual deputies to still be group members', async () => {
		const dataDir = await makeTempDir();
		const plugin = fakePlugin({
			apiGroups: ['g1'],
			groupInfos: [
				groupInfo({
					threadId: 'g1',
					memberIds: ['other'],
				}),
			],
		});
		const tracker = new GroupTracker(plugin, path.join(dataDir, 'groups.json'));

		await tracker.refreshGroups();
		plugin.bot.permissionManager.isVirtualDeputy = vi.fn(
			(threadId: string, userId: string) => threadId === 'g1' && userId === 'user',
		);

		await expect(tracker.getManageableGroupsForUser('user')).resolves.toEqual([]);
		await expect(tracker.getRoleForUser('user', 'g1')).resolves.toBe(Role.Member);
	});
});

describe('dashboard member policy', () => {
	it('limits virtual deputy grants and moderation to normal members', () => {
		expect(canGrantVirtualDeputy(Role.Leader, false, member('member'))).toBe(true);
		expect(canGrantVirtualDeputy(Role.Leader, false, member('deputy'))).toBe(false);
		expect(canGrantVirtualDeputy(Role.Leader, false, member('virtualDeputy'))).toBe(false);
		expect(canGrantVirtualDeputy(Role.Leader, false, member('botAdmin'))).toBe(false);
		expect(canGrantVirtualDeputy(Role.Leader, false, member('bot'))).toBe(false);
		expect(canModerateMember(Role.Deputy, false, member('member'))).toBe(true);
		expect(canModerateMember(Role.Deputy, false, member('leader'))).toBe(false);
	});

	it('only revokes virtual deputy role from virtual deputies', () => {
		expect(canRevokeVirtualDeputy(Role.Leader, false, member('virtualDeputy'))).toBe(true);
		expect(canRevokeVirtualDeputy(Role.Leader, false, member('member'))).toBe(false);
	});
});

function fakePlugin(options: {
	adminIds?: string[];
	allGroups?: string[];
	manageableGroups?: string[];
	roleForUser?: Role;
	apiGroups?: string[];
	groupInfos?: GroupInfo[];
}): Main {
	const groupInfoMap = new Map((options.groupInfos ?? []).map((group) => [group.threadId, group]));

	return {
		bot: {
			config: {
				ADMIN_IDS: options.adminIds ?? [],
			},
			api: {
				getAllGroups: vi.fn().mockResolvedValue({
					gridVerMap: Object.fromEntries((options.apiGroups ?? []).map((id) => [id, 1])),
				}),
			},
			permissionManager: {
				isVirtualDeputy: vi.fn().mockReturnValue(false),
			},
		},
		groupTracker: {
			getAllGroupIds: vi.fn().mockReturnValue(options.allGroups ?? []),
			getManageableGroupsForUser: vi
				.fn()
				.mockResolvedValue(options.manageableGroups ?? []),
			getRoleForUser: vi.fn().mockResolvedValue(options.roleForUser ?? Role.Deputy),
		},
		groupService: {
			getGroupsInfo: vi.fn(async (threadIds: string[]) =>
				threadIds.flatMap((threadId) => {
					const group = groupInfoMap.get(threadId);
					return group ? [group] : [];
				}),
			),
			getGroupInfo: vi.fn(async (threadId: string) => groupInfoMap.get(threadId)),
		},
		logger: {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
	} as unknown as Main;
}

function groupInfo(overrides: Partial<GroupInfo> = {}): GroupInfo {
	return {
		threadId: 'g1',
		name: 'Group',
		memberCount: overrides.memberIds?.length ?? 0,
		memberIds: [],
		creatorId: '',
		adminIds: [],
		isTracked: true,
		...overrides,
	};
}

function member(role: GroupMember['role']): GroupMember {
	return {
		userId: role,
		displayName: role,
		avatar: '',
		role,
		roleLevel: role === 'botAdmin' ? Role.BotAdmin : role === 'leader' ? Role.Leader : Role.Member,
		canBeModerated: role === 'member',
		isCreator: role === 'leader',
		isZaloDeputy: role === 'deputy',
		isVirtualDeputy: role === 'virtualDeputy',
		isBotAdmin: role === 'botAdmin',
		isBot: role === 'bot',
	};
}

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), 'dashboard-test-'));
	tempDirs.push(dir);
	return dir;
}
