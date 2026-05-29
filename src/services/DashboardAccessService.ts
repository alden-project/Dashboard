import { Role } from '@/api';
import type { Session } from '../auth/SessionManager';
import type Main from '../main';

export interface DashboardScope {
	userId: string;
	role: Role;
	isBotAdmin: boolean;
	groupIds: string[];
}

export interface DashboardGroupAccess {
	sessionUserId: string;
	isBotAdmin: boolean;
	actorRole: Role;
}

export interface DashboardAccessOptions {
	refresh?: boolean;
}

export class DashboardAccessService {
	public constructor(private readonly plugin: Main) {}

	public async resolveUserScope(
		userId: string,
		options: DashboardAccessOptions = {},
	): Promise<DashboardScope | null> {
		const isBotAdmin = this.plugin.bot.config.ADMIN_IDS.includes(userId);
		const groupIds = isBotAdmin
			? this.plugin.groupTracker.getAllGroupIds()
			: await this.plugin.groupTracker.getManageableGroupsForUser(userId, options);

		if (!isBotAdmin && groupIds.length === 0) return null;

		return {
			userId,
			role: isBotAdmin ? Role.BotAdmin : Role.Member,
			isBotAdmin,
			groupIds,
		};
	}

	public async resolveSessionScope(
		session: Session,
		options: DashboardAccessOptions = {},
	): Promise<DashboardScope | null> {
		const scope = await this.resolveUserScope(session.userId, options);
		if (!scope) return null;

		session.role = scope.role;
		session.groupIds = scope.groupIds;
		return scope;
	}

	public async resolveGroupAccess(
		session: Session,
		threadId: string,
		options: DashboardAccessOptions = {},
	): Promise<DashboardGroupAccess | null> {
		const scope = await this.resolveSessionScope(session, options);
		if (!scope) return null;

		if (scope.isBotAdmin) {
			return {
				sessionUserId: session.userId,
				isBotAdmin: true,
				actorRole: Role.BotAdmin,
			};
		}

		if (!scope.groupIds.includes(threadId)) return null;

		const actorRole = await this.plugin.groupTracker.getRoleForUser(session.userId, threadId, {
			refresh: options.refresh ?? true,
		});
		if (actorRole < Role.Deputy) return null;

		return {
			sessionUserId: session.userId,
			isBotAdmin: false,
			actorRole,
		};
	}
}
