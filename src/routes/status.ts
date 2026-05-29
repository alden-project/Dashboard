import { Hono } from 'hono';
import type Main from '../main';
import { expireDashboardSession, requireAdmin, requireAuth } from '../auth/middleware';
import { renderStatus } from '../views/status';
import { renderDashboard } from '../views/dashboard';

export function createStatusRoutes(plugin: Main): Hono {
	const app = new Hono();

	app.use('/status', requireAdmin(plugin));
	app.use('/dashboard', requireAuth);

	app.get('/status', (c) => {
		const status = plugin.botService.getStatus();
		return c.html(renderStatus(status, plugin.i18n!, plugin.bot.config.LANGUAGE, true));
	});

	app.get('/dashboard', async (c) => {
		const session = c.get('session');
		if (!session) {
			return c.redirect('/login');
		}

		const scope = await plugin.accessService.resolveSessionScope(session, { refresh: true });
		if (!scope) return expireDashboardSession(c, plugin);

		const status = plugin.botService.getStatus();

		return c.html(
			renderDashboard(
				status,
				scope.groupIds.length,
				plugin.i18n!,
				plugin.bot.config.LANGUAGE,
				scope.isBotAdmin,
			),
		);
	});

	return app;
}
