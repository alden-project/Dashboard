import type { I18nManager } from '@/api';
import type { BotStatus } from '../services/BotService';
import { renderLayout } from './layout';
import { escapeHtml } from '../utils/html';
import { kvList, metricGrid, pageHeader, panel, progressBar } from './ui';

export function renderStatus(
	status: BotStatus,
	i18n: I18nManager,
	lang: string,
	isAdmin = false,
): string {
	const usedMem = status.os.totalMem - status.os.freeMem;
	const memPercent = Math.round((usedMem / status.os.totalMem) * 100);
	const heapPercent = Math.round((status.memory.heapUsed / status.memory.heapTotal) * 100);

	const content = `
		${pageHeader('System Status', 'Real-time system information')}
		<div class="section-stack">
			${metricGrid(
				[
					{ label: 'Version', value: `v${escapeHtml(status.version)}` },
					{ label: 'Uptime', value: escapeHtml(status.uptimeFormatted) },
					{ label: 'Plugins', value: String(status.pluginCount) },
					{ label: 'Groups', value: String(status.groupCount) },
				],
				4,
			)}

			<div class="layout-grid grid-2">
				${panel(
					'Memory (heap)',
					`
						<div class="kv-row">
							<span class="kv-key">${status.memory.heapUsed} MB used</span>
							<span class="kv-value">${status.memory.heapTotal} MB total</span>
						</div>
						${progressBar(heapPercent)}
						<p class="subtle text-right">${heapPercent}%</p>
					`,
				)}
				${panel(
					'Memory used',
					`
						<div class="kv-row">
							<span class="kv-key">${usedMem} MB used</span>
							<span class="kv-value">${status.os.totalMem} MB total</span>
						</div>
						${progressBar(memPercent, true)}
						<p class="subtle text-right">${memPercent}%</p>
					`,
				)}
			</div>

			${panel(
				'System information',
				`<div class="layout-grid grid-2">
					${kvList([
						{ label: 'OS', value: escapeHtml(status.os.type) },
						{ label: 'Release', value: escapeHtml(status.os.release) },
						{ label: 'Architecture', value: escapeHtml(status.os.arch) },
					])}
					${kvList([
						{ label: 'Node.js', value: escapeHtml(status.node) },
						{ label: 'CPU', value: escapeHtml(status.cpu) },
						{ label: 'RSS Memory', value: `${status.memory.rss} MB` },
					])}
				</div>`,
			)}
		</div>
	`;

	return renderLayout('Status', content, i18n, lang, isAdmin, 'status');
}
