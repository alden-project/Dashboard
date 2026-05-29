import type { I18nManager } from '@/api';
import type { BotConfigData } from '../services/BotService';
import { renderLayout } from './layout';
import { escapeHtml } from '../utils/html';
import { codePill, kvList, pageHeader, panel } from './ui';

export function renderConfig(config: BotConfigData, i18n: I18nManager, lang: string): string {
	const adminIds =
		config.adminIds.length > 0
			? `<span class="actions actions-right">${config.adminIds.map((id) => codePill(id)).join('')}</span>`
			: '<span class="muted">None</span>';

	const content = `
		${pageHeader('Bot Config', 'Current configuration (read-only)')}
		<div id="config-result"></div>
		${panel(
			'Configuration values',
			kvList([
				{ label: 'Version', value: `v${escapeHtml(config.version)}` },
				{ label: 'Prefix', value: codePill(config.prefix) },
				{
					label: 'Language',
					value: config.language === 'vi' ? 'Vietnamese' : 'English',
				},
				{ label: 'Reply Unknown', value: config.replyUnknownCommand ? 'Yes' : 'No' },
				{ label: 'Admin IDs', value: adminIds },
			]),
		)}
	`;

	return renderLayout('Config', content, i18n, lang, true, 'config');
}
