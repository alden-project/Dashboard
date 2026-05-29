import path from 'node:path';
import { readJsonFileAsync, Role, writeJsonFileAsync } from '@/api';
import type Main from '../main';

export interface GroupInfo {
	threadId: string;
	name: string;
	memberCount: number;
	memberIds: string[];
	creatorId: string;
	adminIds: string[];
	isTracked: boolean;
}

export interface GroupMember {
	userId: string;
	displayName: string;
	avatar: string;
	role: 'botAdmin' | 'leader' | 'deputy' | 'virtualDeputy' | 'bot' | 'member';
	roleLevel: Role;
	canBeModerated: boolean;
	isCreator: boolean;
	isZaloDeputy: boolean;
	isVirtualDeputy: boolean;
	isBotAdmin: boolean;
	isBot: boolean;
}

export type GroupMemberRoleFilter = GroupMember['role'] | 'all';

export interface GroupMemberListOptions {
	page?: number;
	pageSize?: number;
	role?: GroupMemberRoleFilter;
	query?: string;
}

export interface GroupMemberPage {
	members: GroupMember[];
	total: number;
	filteredTotal: number;
	page: number;
	pageSize: number;
	totalPages: number;
	role: GroupMemberRoleFilter;
	query: string;
}

export interface BlockedMember {
	userId: string;
	displayName: string;
	avatar: string;
	accountStatus: number;
}

export interface PendingMember {
	userId: string;
	displayName: string;
	avatar: string;
}

interface GroupLinksFile {
	links: Record<string, string>;
}

interface MemberProfile {
	displayName?: string;
	zaloName?: string;
	avatar?: string;
}

interface GroupInfoCacheEntry {
	value: GroupInfo;
	expiresAt: number;
}

interface GroupInfoOptions {
	refresh?: boolean;
}

const GROUP_INFO_BATCH_SIZE = 20;
const GROUP_INFO_BATCH_DELAY_MS = 100;
const GROUP_INFO_CACHE_TTL_MS = 2 * 60 * 1000;

export class GroupService {
	private botUserId: string | null = null;
	private readonly linksPath: string;
	private groupLinks = new Map<string, string>();
	private groupInfoCache = new Map<string, GroupInfoCacheEntry>();

	constructor(private readonly plugin: Main) {
		this.linksPath = path.join(plugin.dataFolder, 'group-links.json');
	}

	public async loadLinks(): Promise<void> {
		const data = await readJsonFileAsync<GroupLinksFile>(this.linksPath);
		if (data?.links) {
			for (const [threadId, link] of Object.entries(data.links)) {
				if (typeof link === 'string') {
					this.groupLinks.set(threadId, link);
				}
			}
		}
	}

	private async saveLinks(): Promise<void> {
		const links: Record<string, string> = {};
		for (const [threadId, link] of this.groupLinks) {
			links[threadId] = link;
		}
		await writeJsonFileAsync(this.linksPath, { links });
	}

	public async getBotUserId(): Promise<string> {
		if (this.botUserId) return this.botUserId;

		try {
			const { profile } = await this.plugin.bot.api.fetchAccountInfo();
			this.botUserId = profile.userId ?? '';
			return this.botUserId;
		} catch (error) {
			this.plugin.logger.error('Failed to get bot own ID', error);
			return '';
		}
	}

	private mapGroupInfo(
		threadId: string,
		group: { name?: string; memVerList?: string[]; creatorId?: string; adminIds?: string[] },
	): GroupInfo {
		const memberIds =
			group.memVerList
				?.map((uid) => uid.split('_')[0])
				.filter((uid): uid is string => typeof uid === 'string' && uid.length > 0) ?? [];

		return {
			threadId,
			name: group.name || 'Unknown',
			memberCount: group.memVerList?.length || 0,
			memberIds,
			creatorId: group.creatorId || '',
			adminIds: group.adminIds || [],
			isTracked: true,
		};
	}

	private getCachedGroupInfo(threadId: string): GroupInfo | undefined {
		const cached = this.groupInfoCache.get(threadId);
		if (!cached) return undefined;
		if (cached.expiresAt <= Date.now()) {
			this.groupInfoCache.delete(threadId);
			return undefined;
		}
		return cached.value;
	}

	private setCachedGroupInfo(group: GroupInfo): void {
		this.groupInfoCache.set(group.threadId, {
			value: group,
			expiresAt: Date.now() + GROUP_INFO_CACHE_TTL_MS,
		});
	}

	private mapGroupInfoResponse(
		threadId: string,
		group: { name?: string; memVerList?: string[]; creatorId?: string; adminIds?: string[] },
	): GroupInfo {
		const mapped = this.mapGroupInfo(threadId, group);
		this.setCachedGroupInfo(mapped);
		return mapped;
	}

	public async getGroupInfo(
		threadId: string,
		options: GroupInfoOptions = {},
	): Promise<GroupInfo | undefined> {
		if (!options.refresh) {
			const cached = this.getCachedGroupInfo(threadId);
			if (cached) return cached;
		}

		try {
			const info = await this.plugin.bot.api.getGroupInfo(threadId);
			const group = info.gridInfoMap[threadId];
			if (!group) return undefined;
			return this.mapGroupInfoResponse(threadId, group);
		} catch (error) {
			this.plugin.logger.error(`Failed to get group info for ${threadId}`, error);
			return undefined;
		}
	}

	public async getGroupsInfo(
		threadIds: string[],
		options: GroupInfoOptions = {},
	): Promise<GroupInfo[]> {
		if (threadIds.length === 0) return [];

		const uniqueThreadIds = Array.from(new Set(threadIds));
		const groupsById = new Map<string, GroupInfo>();
		const missingThreadIds: string[] = [];

		for (const threadId of uniqueThreadIds) {
			if (!options.refresh) {
				const cached = this.getCachedGroupInfo(threadId);
				if (cached) {
					groupsById.set(threadId, cached);
					continue;
				}
			}
			missingThreadIds.push(threadId);
		}

		for (let index = 0; index < missingThreadIds.length; index += GROUP_INFO_BATCH_SIZE) {
			const chunk = missingThreadIds.slice(index, index + GROUP_INFO_BATCH_SIZE);

			try {
				const info = await this.plugin.bot.api.getGroupInfo(chunk);
				for (const threadId of chunk) {
					const group = info.gridInfoMap[threadId];
					if (group) {
						groupsById.set(threadId, this.mapGroupInfoResponse(threadId, group));
					}
				}
			} catch (error) {
				this.plugin.logger.warn(
					`Failed to get ${chunk.length} groups in batch, retrying individually`,
					error,
				);
				await this.getGroupsInfoIndividually(chunk, groupsById);
			}

			if (index + GROUP_INFO_BATCH_SIZE < missingThreadIds.length) {
				await delay(GROUP_INFO_BATCH_DELAY_MS);
			}
		}

		return uniqueThreadIds.flatMap((threadId) => {
			const group = groupsById.get(threadId);
			return group ? [group] : [];
		});
	}

	private async getGroupsInfoIndividually(
		threadIds: string[],
		groupsById: Map<string, GroupInfo>,
	): Promise<void> {
		for (const threadId of threadIds) {
			try {
				const info = await this.plugin.bot.api.getGroupInfo(threadId);
				const group = info.gridInfoMap[threadId];
				if (group) {
					groupsById.set(threadId, this.mapGroupInfoResponse(threadId, group));
				}
			} catch (error) {
				this.plugin.logger.warn(`Failed to get group info for ${threadId}`, error);
			}

			await delay(GROUP_INFO_BATCH_DELAY_MS);
		}
	}

	public async getGroupMembers(threadId: string, groupInfo?: GroupInfo): Promise<GroupMember[]> {
		const page = await this.getGroupMembersPage(threadId, groupInfo, {
			page: 1,
			pageSize: Number.MAX_SAFE_INTEGER,
		});
		return page.members;
	}

	public async getGroupMembersPage(
		threadId: string,
		groupInfo?: GroupInfo,
		options: GroupMemberListOptions = {},
	): Promise<GroupMemberPage> {
		try {
			const source = await this.getGroupMemberSource(threadId, groupInfo);
			if (!source || source.uids.length === 0) return emptyMemberPage(options);

			const botId = await this.getBotUserId();
			const role = normalizeRoleFilter(options.role);
			const query = String(options.query ?? '').trim().toLowerCase();
			const pageSize = normalizePositiveInt(options.pageSize, 24);
			const total = source.uids.length;

			const filteredUids = source.uids.filter((uid) => {
				const memberRole = this.getMemberRoleFromIds(
					threadId,
					uid,
					botId,
					source.creatorId,
					source.adminIds,
				);
				if (role !== 'all' && memberRole !== role) return false;
				return !query || uid.toLowerCase().includes(query);
			});

			const totalPages = Math.max(1, Math.ceil(filteredUids.length / pageSize));
			const page = Math.min(normalizePositiveInt(options.page, 1), totalPages);
			const start = (page - 1) * pageSize;
			const pageUids = filteredUids.slice(start, start + pageSize);
			const members = await this.mapGroupMembers(
				threadId,
				pageUids,
				source.creatorId,
				source.adminIds,
				botId,
			);

			return {
				members,
				total,
				filteredTotal: filteredUids.length,
				page,
				pageSize,
				totalPages,
				role,
				query,
			};
		} catch (error) {
			this.plugin.logger.error(`Failed to get group members for ${threadId}`, error);
			return emptyMemberPage(options);
		}
	}

	private async getGroupMemberSource(
		threadId: string,
		groupInfo?: GroupInfo,
	): Promise<{ uids: string[]; creatorId: string; adminIds: string[] } | undefined> {
		if (groupInfo) {
			return {
				uids: groupInfo.memberIds,
				creatorId: groupInfo.creatorId,
				adminIds: groupInfo.adminIds,
			};
		}

		const info = await this.plugin.bot.api.getGroupInfo(threadId);
		const group = info.gridInfoMap[threadId];
		if (!group?.memVerList) return undefined;

		return {
			uids: group.memVerList
				.map((uid) => uid.split('_')[0])
				.filter((uid): uid is string => typeof uid === 'string' && uid.length > 0),
			creatorId: group.creatorId || '',
			adminIds: group.adminIds || [],
		};
	}

	private async mapGroupMembers(
		threadId: string,
		uids: string[],
		creatorId: string,
		adminIds: string[],
		botId: string,
	): Promise<GroupMember[]> {
		if (uids.length === 0) return [];

		let profiles: Record<string, MemberProfile> = {};
		try {
			const membersInfo = await this.plugin.bot.api.getGroupMembersInfo(uids);
			profiles = membersInfo.profiles as Record<string, MemberProfile>;
		} catch (error) {
			this.plugin.logger.warn('Failed to fetch group members info, using fallback names', error);
		}

		return uids.map((uid) => {
			const profile = profiles[uid];
			const role = this.getMemberRoleFromIds(threadId, uid, botId, creatorId, adminIds);

			return {
				userId: uid,
				displayName: profile?.displayName || profile?.zaloName || `User ${uid.slice(-6)}`,
				avatar: profile?.avatar || '',
				role,
				roleLevel: getMemberRoleLevel(role),
				canBeModerated: role === 'member',
				isCreator: creatorId === uid,
				isZaloDeputy: adminIds.includes(uid),
				isVirtualDeputy: this.plugin.bot.permissionManager.isVirtualDeputy(threadId, uid),
				isBotAdmin: this.plugin.bot.config.ADMIN_IDS.includes(uid),
				isBot: uid === botId,
			};
		});
	}

	private getMemberRoleFromIds(
		threadId: string,
		uid: string,
		botId: string,
		creatorId: string,
		adminIds: string[],
	): GroupMember['role'] {
		return getMemberRole({
			isBot: uid === botId,
			isBotAdmin: this.plugin.bot.config.ADMIN_IDS.includes(uid),
			isCreator: creatorId === uid,
			isZaloDeputy: adminIds.includes(uid),
			isVirtualDeputy: this.plugin.bot.permissionManager.isVirtualDeputy(threadId, uid),
		});
	}

	public async getGroupMember(
		threadId: string,
		userId: string,
		groupInfo?: GroupInfo,
	): Promise<GroupMember | undefined> {
		try {
			const source = await this.getGroupMemberSource(threadId, groupInfo);
			if (!source || !source.uids.includes(userId)) return undefined;

			const botId = await this.getBotUserId();
			const [member] = await this.mapGroupMembers(
				threadId,
				[userId],
				source.creatorId,
				source.adminIds,
				botId,
			);
			return member;
		} catch (error) {
			this.plugin.logger.error(`Failed to get group member ${userId} for ${threadId}`, error);
			return undefined;
		}
	}

	public async getBlockedMembers(threadId: string): Promise<BlockedMember[]> {
		try {
			const result = await this.plugin.bot.api.getGroupBlockedMember(
				{ page: 1, count: 50 },
				threadId,
			);
			const blockedMembers = Array.isArray(result.blocked_members)
				? result.blocked_members
				: [];

			return blockedMembers.map((member) => ({
				userId: member.id,
				displayName: member.dName || member.zaloName || `User ${member.id.slice(-6)}`,
				avatar: member.avatar || member.avatar_25 || '',
				accountStatus: member.accountStatus,
			}));
		} catch (error) {
			this.plugin.logger.error(`Failed to get blocked members for ${threadId}`, error);
			return [];
		}
	}

	public async getPendingMembers(threadId: string): Promise<PendingMember[]> {
		try {
			const result = await this.plugin.bot.api.getPendingGroupMembers(threadId);
			const pendingUsers = Array.isArray(result.users) ? result.users : [];

			return pendingUsers.map((member) => ({
				userId: member.uid,
				displayName: member.dpn || `User ${member.uid.slice(-6)}`,
				avatar: member.avatar || '',
			}));
		} catch (error) {
			this.plugin.logger.error(`Failed to get pending members for ${threadId}`, error);
			return [];
		}
	}

	public async addMember(threadId: string, userId: string): Promise<boolean> {
		try {
			const result = await this.plugin.bot.api.addUserToGroup(userId, threadId);
			const errorMembers = Array.isArray(result.errorMembers) ? result.errorMembers : [];
			const errorData = result.error_data ?? {};
			return errorMembers.length === 0 && Object.keys(errorData).length === 0;
		} catch (error) {
			this.plugin.logger.error(`Failed to add ${userId} to ${threadId}`, error);
			return false;
		}
	}

	public async reviewPendingMember(
		threadId: string,
		userId: string,
		isApprove: boolean,
	): Promise<boolean> {
		try {
			const result = await this.plugin.bot.api.reviewPendingMemberRequest(
				{ members: userId, isApprove },
				threadId,
			);
			const statuses = Object.values(result ?? {});
			return statuses.length > 0 && statuses.every((status) => status === 0);
		} catch (error) {
			this.plugin.logger.error(
				`Failed to ${isApprove ? 'approve' : 'reject'} ${userId} for ${threadId}`,
				error,
			);
			return false;
		}
	}

	public async kickMember(threadId: string, userId: string): Promise<boolean> {
		try {
			await this.plugin.bot.api.removeUserFromGroup(userId, threadId);
			return true;
		} catch (error) {
			this.plugin.logger.error(`Failed to kick ${userId} from ${threadId}`, error);
			return false;
		}
	}

	public async banMember(threadId: string, userId: string): Promise<boolean> {
		try {
			await this.plugin.bot.api.addGroupBlockedMember(userId, threadId);
			return true;
		} catch (error) {
			this.plugin.logger.error(`Failed to ban ${userId} from ${threadId}`, error);
			return false;
		}
	}

	public async unbanMember(threadId: string, userId: string): Promise<boolean> {
		try {
			await this.plugin.bot.api.removeGroupBlockedMember(userId, threadId);
			return true;
		} catch (error) {
			this.plugin.logger.error(`Failed to unban ${userId} from ${threadId}`, error);
			return false;
		}
	}

	public async changeName(threadId: string, name: string): Promise<boolean> {
		try {
			await this.plugin.bot.api.changeGroupName(name, threadId);
			return true;
		} catch (error) {
			this.plugin.logger.error(`Failed to change name for ${threadId}`, error);
			return false;
		}
	}

	public getSavedLink(threadId: string): string | undefined {
		return this.groupLinks.get(threadId);
	}

	public async enableLink(threadId: string): Promise<string | undefined> {
		try {
			const result = await this.plugin.bot.api.enableGroupLink(threadId);
			if (result?.link) {
				this.groupLinks.set(threadId, result.link);
				await this.saveLinks();
			}
			return result?.link;
		} catch (error) {
			this.plugin.logger.error(`Failed to enable link for ${threadId}`, error);
			return undefined;
		}
	}

	public async disableLink(threadId: string): Promise<boolean> {
		try {
			await this.plugin.bot.api.disableGroupLink(threadId);
			this.groupLinks.delete(threadId);
			await this.saveLinks();
			return true;
		} catch (error) {
			this.plugin.logger.error(`Failed to disable link for ${threadId}`, error);
			return false;
		}
	}
}

function getMemberRole(flags: {
	isBot: boolean;
	isBotAdmin: boolean;
	isCreator: boolean;
	isZaloDeputy: boolean;
	isVirtualDeputy: boolean;
}): GroupMember['role'] {
	if (flags.isBot) return 'bot';
	if (flags.isBotAdmin) return 'botAdmin';
	if (flags.isCreator) return 'leader';
	if (flags.isZaloDeputy) return 'deputy';
	if (flags.isVirtualDeputy) return 'virtualDeputy';
	return 'member';
}

function getMemberRoleLevel(role: GroupMember['role']): Role {
	switch (role) {
		case 'botAdmin':
			return Role.BotAdmin;
		case 'leader':
			return Role.Leader;
		case 'deputy':
		case 'virtualDeputy':
			return Role.Deputy;
		case 'bot':
		case 'member':
			return Role.Member;
	}
}

function normalizeRoleFilter(value: unknown): GroupMemberRoleFilter {
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

function normalizePositiveInt(value: unknown, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return Math.floor(parsed);
}

function emptyMemberPage(options: GroupMemberListOptions): GroupMemberPage {
	const pageSize = normalizePositiveInt(options.pageSize, 24);
	return {
		members: [],
		total: 0,
		filteredTotal: 0,
		page: 1,
		pageSize,
		totalPages: 1,
		role: normalizeRoleFilter(options.role),
		query: String(options.query ?? '').trim().toLowerCase(),
	};
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
