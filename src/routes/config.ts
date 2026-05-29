import { Hono } from 'hono';
import type Main from '../main';
import { requireAdmin } from '../auth/middleware';
import { renderConfig } from '../views/config';
import { toast } from '../utils/html';

export function createConfigRoutes(plugin: Main): Hono {
	const app = new Hono();

	app.use('/config/*', requireAdmin(plugin));

	app.get('/config', (c) => {
		const config = plugin.botService.getConfig();

		return c.html(renderConfig(config, plugin.i18n!, plugin.bot.config.LANGUAGE));
	});

	app.post('/config', async (c) => {
		return c.html(toast('warning', 'Config changes require a bot restart to take effect.'));
	});

	return app;
}
