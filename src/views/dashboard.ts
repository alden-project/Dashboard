import type { I18nManager } from '@/api';
import type { BotStatus } from '../services/BotService';
import { renderLayout } from './layout';
import { escapeAttr, escapeHtml } from '../utils/html';
import { icon, kvList, metricGrid, pageHeader, panel, progressBar } from './ui';

const ICONS = {
	version: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
	uptime: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
	memory: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
	groups: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
	plugins: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
};

export function renderDashboard(
	status: BotStatus,
	groupCount: number,
	i18n: I18nManager,
	lang: string,
	isAdmin = false,
): string {
	const usedMem = status.os.totalMem - status.os.freeMem;
	const memPercent = Math.round((usedMem / status.os.totalMem) * 100);
	const heapPercent = Math.round((status.memory.heapUsed / status.memory.heapTotal) * 100);

	const metrics = [
		{ label: 'Version', value: `v${escapeHtml(status.version)}`, icon: ICONS.version },
		{ label: 'Uptime', value: escapeHtml(status.uptimeFormatted), icon: ICONS.uptime },
		{ label: 'Groups', value: String(groupCount), icon: ICONS.groups },
	];

	if (isAdmin) {
		metrics.splice(2, 0, {
			label: 'Heap',
			value: `${escapeHtml(status.memory.heapUsed)} MB`,
			icon: ICONS.memory,
		});
		metrics.push({
			label: 'Plugins',
			value: String(status.pluginCount),
			icon: ICONS.plugins,
		});
	}

	const quickActions = [
		{
			href: '/groups',
			label: 'Groups',
			description: 'Manage group chats',
			icon: ICONS.groups,
		},
	];

	if (isAdmin) {
		quickActions.push(
			{
				href: '/ops',
				label: 'Control Panel',
				description: 'Runtime actions and logs',
				icon: 'M13 10V3L4 14h7v7l9-11h-7z',
			},
			{
				href: '/plugins',
				label: 'Plugins',
				description: 'View loaded plugins',
				icon: ICONS.plugins,
			},
			{
				href: '/permissions',
				label: 'Permissions',
				description: 'Manage access control',
				icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
			},
		);
	}

	const content = `
		${pageHeader('Overview', 'Bot dashboard and system status')}
		<div class="section-stack">
			${panel(
				'Quick actions',
				`<div class="layout-grid grid-5">${quickActions
					.map(
						(action) => `
						<a href="${escapeAttr(action.href)}" class="action-card">
							<span class="action-card-icon">${icon(action.icon)}</span>
							<span>
								<strong>${escapeHtml(action.label)}</strong>
								<small>${escapeHtml(action.description)}</small>
							</span>
						</a>`,
					)
					.join('')}</div>`,
			)}
			${metricGrid(metrics, isAdmin ? 5 : 3)}
			${
				isAdmin
					? `<div class="layout-grid grid-2">
						${panel(
							'System',
							kvList([
								{
									label: 'OS',
									value: `${escapeHtml(status.os.type)} ${escapeHtml(status.os.arch)}`,
								},
								{ label: 'Node.js', value: escapeHtml(status.node) },
								{ label: 'CPU', value: escapeHtml(status.cpu) },
							]),
						)}
						${panel(
							'Memory usage',
							`
								<div class="field-stack">
									<div>
										<div class="kv-row">
											<span class="kv-key">Heap</span>
											<span class="kv-value">${status.memory.heapUsed} / ${status.memory.heapTotal} MB</span>
										</div>
										${progressBar(heapPercent)}
										<p class="subtle text-right">${heapPercent}%</p>
									</div>
									<div>
										<div class="kv-row">
											<span class="kv-key">System</span>
											<span class="kv-value">${usedMem} / ${status.os.totalMem} MB</span>
										</div>
										${progressBar(memPercent, true)}
										<p class="subtle text-right">${memPercent}%</p>
									</div>
								</div>
							`,
						)}
					</div>`
					: ''
			}
		</div>
	`;

	return renderLayout('Overview', content, i18n, lang, isAdmin, 'dashboard');
}
