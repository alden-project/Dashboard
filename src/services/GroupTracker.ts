import { readJsonFileAsync, writeJsonFileAsync } from '@/api';
import { Role } from '@/api';
import type Main from '../main';

interface GroupEntry {
	firstSeen: number;
	lastSeen: number;
}

interface GroupFile {
	groups: Record<string, GroupEntry>;
}

interface GroupAccessOptions {
	refresh?: boolean;
}

export class GroupTracker {
	private readonly groups = new Map<string, GroupEntry>();
	private refreshTimer?: NodeJS.Timeout;

	public constructor(
		private readonly plugin: Main,
		private readonly dataPath: string,
	) {}

	public async load(): Promise<void> {
		const data = await readJsonFileAsync<GroupFile>(this.dataPath);
		if (data?.groups) {
			for (const [threadId, entry] of Object.entries(data.groups)) {
				if (isGroupEntry(entry)) {
					this.groups.set(threadId, entry);
				}
			}
		}

		await this.refreshGroups();

		this.refreshTimer = setInterval(
			() => {
				void this.refreshGroups();
			},
			10 * 60 * 1000,
		);
	}

	public async save(): Promise<void> {
		const groups: Record<string, GroupEntry> = {};
		for (const [threadId, entry] of this.groups) {
			groups[threadId] = entry;
		}
		await writeJsonFileAsync(this.dataPath, { groups });
	}

	public stop(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	public async refreshGroups(): Promise<void> {
		try {
			const response = await this.plugin.bot.api.getAllGroups();
			const groupIds = Object.keys(response.gridVerMap || {});
			const activeGroupIds = new Set(groupIds);
			const now = Date.now();
			let newCount = 0;
			let removedCount = 0;

			for (const threadId of groupIds) {
				if (!this.groups.has(threadId)) {
					this.groups.set(threadId, { firstSeen: now, lastSeen: now });
					newCount++;
				} else {
					const entry = this.groups.get(threadId)!;
					entry.lastSeen = now;
				}
			}

			for (const threadId of Array.from(this.groups.keys())) {
				if (!activeGroupIds.has(threadId)) {
					this.groups.delete(threadId);
					removedCount++;
				}
			}

			if (newCount > 0 || removedCount > 0) {
				this.plugin.logger.info(
					`GroupTracker: Discovered ${newCount} new groups, removed ${removedCount} stale groups`,
				);
				await this.save();
			} else {
				this.plugin.logger.debug(`GroupTracker: Refreshed ${groupIds.length} groups`);
			}
		} catch (error) {
			this.plugin.logger.error('GroupTracker: Failed to refresh groups', error);
		}
	}

	public getAllGroupIds(): string[] {
		return Array.from(this.groups.keys());
	}

	public isTrackedGroup(threadId: string): boolean {
		return this.groups.has(threadId);
	}

	public getGroupEntry(threadId: string): GroupEntry | undefined {
		return this.groups.get(threadId);
	}

	public async isUserGroupLeader(userId: string, threadId: string): Promise<boolean> {
		try {
			const info = await this.plugin.bot.api.getGroupInfo(threadId);
			const group = info.gridInfoMap[threadId];
			if (!group) return false;

			if (group.creatorId === userId) return true;
			if (group.adminIds?.includes(userId)) return true;

			return false;
		} catch {
			return false;
		}
	}

	public async getGroupsForUser(
		userId: string,
		options: GroupAccessOptions = {},
	): Promise<string[]> {
		return this.getManageableGroupsForUser(userId, options);
	}

	public async getManageableGroupsForUser(
		userId: string,
		options: GroupAccessOptions = {},
	): Promise<string[]> {
		if (this.plugin.bot.config.ADMIN_IDS.includes(userId)) {
			return this.getAllGroupIds();
		}

		const managedGroups: string[] = [];
		const threadIds = Array.from(this.groups.keys());
		if (threadIds.length === 0) return managedGroups;

		const managed = new Set<string>();

		try {
			const groups = await this.plugin.groupService.getGroupsInfo(threadIds, {
				refresh: options.refresh ?? true,
			});

			for (const group of groups) {
				if (group.creatorId === userId || group.adminIds.includes(userId)) {
					managed.add(group.threadId);
					continue;
				}

				if (
					group.memberIds.includes(userId) &&
					this.plugin.bot.permissionManager.isVirtualDeputy(group.threadId, userId)
				) {
					managed.add(group.threadId);
				}
			}
		} catch (error) {
			this.plugin.logger.error('GroupTracker: Failed to get group info for user', error);
		}

		return Array.from(managed);
	}

	public async getRoleForUser(
		userId: string,
		threadId: string,
		options: GroupAccessOptions = {},
	): Promise<Role> {
		if (this.plugin.bot.config.ADMIN_IDS.includes(userId)) return Role.BotAdmin;
		if (!this.isTrackedGroup(threadId)) return Role.Member;

		const group = await this.plugin.groupService.getGroupInfo(threadId, {
			refresh: options.refresh ?? true,
		});

		if (group) {
			if (group.creatorId === userId) return Role.Leader;
			if (group.adminIds.includes(userId)) return Role.Deputy;
		}

		if (
			group?.memberIds.includes(userId) &&
			this.plugin.bot.permissionManager.isVirtualDeputy(threadId, userId)
		) {
			return Role.Deputy;
		}

		return Role.Member;
	}
}

function isGroupEntry(value: unknown): value is GroupEntry {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<GroupEntry>;
	return typeof candidate.firstSeen === 'number' && typeof candidate.lastSeen === 'number';
}
