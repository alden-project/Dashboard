import { Hono } from 'hono';
import { Role } from '@/api';
import type Main from '../main';
import { requireAdmin } from '../auth/middleware';
import { renderPermissions } from '../views/permissions';
import { canGrantVirtualDeputy, canRevokeVirtualDeputy } from '../auth/access';
import { toast } from '../utils/html';

export function createPermissionRoutes(plugin: Main): Hono {
	const app = new Hono();

	app.use('/permissions/*', requireAdmin(plugin));

	app.get('/permissions', (c) => {
		const nodes = plugin.botService.getPermissionNodes();

		return c.html(renderPermissions(nodes, plugin.i18n!, plugin.bot.config.LANGUAGE));
	});

	app.post('/permissions/grant', async (c) => {
		const body = await c.req.parseBody();
		const userId = body['userId'] as string;
		const node = body['node'] as string;

		if (!userId || !node) {
			return c.html(toast('error', 'User ID and node are required'));
		}

		const success = await plugin.botService.grantPermission(userId, node);
		return c.html(
			success
				? toast('success', `Granted "${node}" to ${userId}`)
				: toast('error', 'Failed to grant permission'),
		);
	});

	app.post('/permissions/revoke', async (c) => {
		const body = await c.req.parseBody();
		const userId = body['userId'] as string;
		const node = body['node'] as string;

		if (!userId || !node) {
			return c.html(toast('error', 'User ID and node are required'));
		}

		const success = await plugin.botService.revokePermission(userId, node);
		return c.html(
			success
				? toast('success', `Revoked "${node}" from ${userId}`)
				: toast('error', 'Failed to revoke permission'),
		);
	});

	app.post('/permissions/deputy/add', async (c) => {
		const body = await c.req.parseBody();
		const threadId = body['threadId'] as string;
		const userId = body['userId'] as string;

		if (!threadId || !userId) {
			return c.html(toast('error', 'Thread ID and User ID are required'));
		}

		const target = await plugin.groupService.getGroupMember(threadId, userId);
		if (!target) return c.html(toast('error', 'Member not found in this group'), 404);
		if (!canGrantVirtualDeputy(Role.Member, true, target)) {
			return c.html(toast('error', 'Virtual deputy can only be granted to normal members'), 403);
		}

		const success = await plugin.botService.addVirtualDeputy(threadId, userId);
		return c.html(
			success
				? toast('success', 'Virtual deputy added')
				: toast('error', 'Failed to add virtual deputy'),
		);
	});

	app.post('/permissions/deputy/remove', async (c) => {
		const body = await c.req.parseBody();
		const threadId = body['threadId'] as string;
		const userId = body['userId'] as string;

		if (!threadId || !userId) {
			return c.html(toast('error', 'Thread ID and User ID are required'));
		}

		const target = await plugin.groupService.getGroupMember(threadId, userId);
		if (!target) return c.html(toast('error', 'Member not found in this group'), 404);
		if (!canRevokeVirtualDeputy(Role.Member, true, target)) {
			return c.html(toast('error', 'This member is not a virtual deputy'), 403);
		}

		const success = await plugin.botService.removeVirtualDeputy(threadId, userId);
		return c.html(
			success
				? toast('success', 'Virtual deputy removed')
				: toast('error', 'Failed to remove virtual deputy'),
		);
	});

	return app;
}
