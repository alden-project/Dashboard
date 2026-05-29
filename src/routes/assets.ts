import fsp from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import type Main from '../main';

const ASSETS: Record<string, { filename: string; contentType: string }> = {
	'/assets/dashboard.css': {
		filename: 'dashboard.css',
		contentType: 'text/css; charset=utf-8',
	},
	'/assets/dashboard.js': {
		filename: 'dashboard.js',
		contentType: 'application/javascript; charset=utf-8',
	},
};

export function createAssetRoutes(plugin: Main): Hono {
	const app = new Hono();
	const assetRoot = path.join(plugin.pluginPath, 'resources', 'assets');

	for (const [route, asset] of Object.entries(ASSETS)) {
		app.get(route, async (c) => {
			try {
				const body = await fsp.readFile(path.join(assetRoot, asset.filename), 'utf8');
				return new Response(body, {
					headers: {
						'Content-Type': asset.contentType,
						'Cache-Control': 'no-store',
					},
				});
			} catch (error) {
				plugin.logger.error(`Failed to read dashboard asset ${asset.filename}`, error);
				return c.text('Asset not found', 404);
			}
		});
	}

	return app;
}
