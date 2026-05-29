import { Hono } from 'hono';
import type Main from '../main';
import { requireAdmin } from '../auth/middleware';
import { renderLogTail, renderOps } from '../views/ops';
import { toast } from '../utils/html';

export function createOpsRoutes(plugin: Main): Hono {
	const app = new Hono();

	app.use('/ops/*', requireAdmin(plugin));
	app.use('/ops', requireAdmin(plugin));

	app.get('/ops', async (c) => {
		const status = plugin.botService.getStatus();
		const logs = await plugin.botService.getRecentLogs(plugin.config.get('logTailLines'));
		return c.html(renderOps(status, logs, plugin.i18n!, plugin.bot.config.LANGUAGE));
	});

	app.get('/ops/logs', async (c) => {
		const logs = await plugin.botService.getRecentLogs(plugin.config.get('logTailLines'));
		return c.html(renderLogTail(logs));
	});

	app.post('/ops/update-check', async (c) => {
		const result = await plugin.botService.checkUpdate();
		return c.html(
			toast(result.ok ? 'success' : 'error', result.message),
			result.ok ? 200 : 503,
		);
	});

	app.post('/ops/update-apply', async (c) => {
		const result = await plugin.botService.applyUpdate();
		return c.html(
			toast(result.ok ? 'success' : 'error', result.message),
			result.ok ? 200 : 400,
		);
	});

	app.post('/ops/restart', async (c) => {
		const result = await plugin.botService.restart();
		return c.html(
			toast(result.ok ? 'success' : 'error', result.message),
			result.ok ? 200 : 400,
		);
	});

	app.post('/ops/reload-all', async (c) => {
		return c.html(
			toast(
				'warning',
				'Plugin reload is disabled from Dashboard because it can unload the dashboard during the request. Use Restart instead.',
			),
			400,
		);
	});

	return app;
}
