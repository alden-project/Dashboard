import { Hono } from 'hono';
import type Main from '../main';
import { requireAdmin } from '../auth/middleware';
import { renderPlugins } from '../views/plugins';
import { toast } from '../utils/html';

export function createPluginRoutes(plugin: Main): Hono {
	const app = new Hono();

	app.use('/plugins/*', requireAdmin(plugin));

	app.get('/plugins', (c) => {
		const plugins = plugin.botService.getPlugins();
		return c.html(renderPlugins(plugins, plugin.i18n!, plugin.bot.config.LANGUAGE));
	});

	app.post('/plugins/reload-all', async (c) => {
		return c.html(
			toast(
				'warning',
				'Plugin reload is disabled from Dashboard. Use the launcher restart flow instead.',
			),
			400,
		);
	});

	return app;
}
