import { Role } from '@/api';
import type { Session } from './SessionManager';
import type { GroupMember } from '../services/GroupService';

export function isBotAdminSession(session: Session | undefined): boolean {
	return (session?.role ?? Role.Member) >= Role.BotAdmin;
}

export function canAccessGroup(session: Session, threadId: string): boolean {
	return isBotAdminSession(session) || session.groupIds.includes(threadId);
}

export function canManageGroupSettings(actorRole: Role, isBotAdmin: boolean): boolean {
	return isBotAdmin || actorRole >= Role.Deputy;
}

export function canManageVirtualDeputies(actorRole: Role, isBotAdmin: boolean): boolean {
	return isBotAdmin || actorRole >= Role.Leader;
}

export function canModerateMember(
	actorRole: Role,
	isBotAdmin: boolean,
	target: GroupMember,
): boolean {
	if (!canManageGroupSettings(actorRole, isBotAdmin)) return false;
	return target.role === 'member';
}

export function canGrantVirtualDeputy(
	actorRole: Role,
	isBotAdmin: boolean,
	target: GroupMember,
): boolean {
	if (!canManageVirtualDeputies(actorRole, isBotAdmin)) return false;
	return target.role === 'member';
}

export function canRevokeVirtualDeputy(
	actorRole: Role,
	isBotAdmin: boolean,
	target: GroupMember,
): boolean {
	if (!canManageVirtualDeputies(actorRole, isBotAdmin)) return false;
	return target.role === 'virtualDeputy';
}
