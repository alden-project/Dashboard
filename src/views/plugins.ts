import type { I18nManager } from '@/api';
import type { PluginInfo } from '../services/BotService';
import { renderLayout } from './layout';
import { escapeHtml } from '../utils/html';
import { badge, dataTable, pageHeader, panel } from './ui';

export function renderPlugins(plugins: PluginInfo[], i18n: I18nManager, lang: string): string {
	const rows = plugins
		.map(
			(plugin) => `
		<tr>
			<td>
				<div class="identity">
					<div class="avatar avatar-fallback">${escapeHtml(plugin.name.charAt(0).toUpperCase())}</div>
					<div class="identity-meta">
						<div class="identity-name">${escapeHtml(plugin.name)}</div>
						<div class="identity-sub">${escapeHtml(plugin.author)}</div>
					</div>
				</div>
			</td>
			<td>${badge(`v${plugin.version}`, 'info')}</td>
			<td>${escapeHtml(plugin.description)}</td>
		</tr>`,
		)
		.join('');

	const content = `
		${pageHeader('Plugins', `${plugins.length} plugin${plugins.length === 1 ? '' : 's'} loaded`)}
		<div id="plugin-result"></div>
		${panel(
			'Loaded plugins',
			dataTable(
				[
					{ label: 'Name' },
					{ label: 'Version' },
					{ label: 'Description' },
				],
				rows,
				'No plugins loaded',
			),
			{
				compact: true,
			},
		)}
	`;

	return renderLayout('Plugins', content, i18n, lang, true, 'plugins');
}
