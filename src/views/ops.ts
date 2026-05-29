import type { I18nManager } from '@/api';
import type { BotStatus } from '../services/BotService';
import { renderLayout } from './layout';
import { escapeHtml } from '../utils/html';
import { buttonClass, kvList, pageHeader, panel } from './ui';

export function renderOps(
	status: BotStatus,
	logs: readonly string[],
	i18n: I18nManager,
	lang: string,
): string {
	const content = `
		${pageHeader('Control Panel', 'BotAdmin controls for alden-bot runtime operations')}
		<div id="ops-result"></div>
		<div class="section-stack">
			<div class="layout-grid grid-2">
				${panel(
					'Runtime',
					kvList([
						{ label: 'Version', value: `v${escapeHtml(status.version)}` },
						{ label: 'Uptime', value: escapeHtml(status.uptimeFormatted) },
						{ label: 'Node.js', value: escapeHtml(status.node) },
					]),
				)}
				${panel(
					'Process',
					kvList([
						{ label: 'Plugins', value: String(status.pluginCount) },
						{ label: 'Groups', value: String(status.groupCount) },
						{ label: 'CPU', value: escapeHtml(status.cpu) },
					]),
				)}
			</div>
			${panel(
				'Actions',
				`
					<div class="control-actions">
						${renderActionGroup(
							'Update',
							'Check GitHub Releases or queue a launcher-managed update.',
							`
								<button hx-post="/ops/update-check" hx-target="#ops-result" hx-swap="innerHTML" class="${buttonClass()}">Check</button>
								<button hx-post="/ops/update-apply" hx-target="#ops-result" hx-swap="innerHTML" hx-confirm="Apply update and restart alden-bot?" class="${buttonClass('primary')}">Apply</button>
							`,
						)}
						${renderActionGroup(
							'System',
							'Restart through AWAKE or show reload guidance.',
							`
								<button hx-post="/ops/restart" hx-target="#ops-result" hx-swap="innerHTML" hx-confirm="Restart alden-bot now?" class="${buttonClass('warning')}">Restart</button>
								<button hx-post="/ops/reload-all" hx-target="#ops-result" hx-swap="innerHTML" class="${buttonClass()}">Reload all</button>
							`,
						)}
						${renderActionGroup(
							'Logs',
							'View the current runtime log tail.',
							`
								<button hx-get="/ops/logs" hx-target="#log-tail" hx-swap="innerHTML" class="${buttonClass()}">Refresh</button>
								<button type="button" class="${buttonClass()}" data-scroll-log="top">Jump top</button>
								<button type="button" class="${buttonClass()}" data-scroll-log="bottom">Jump bottom</button>
							`,
						)}
					</div>
				`,
			)}
			${panel(
				'Logs',
				`<div id="log-tail">${renderLogTail(logs)}</div>`,
				{ description: `${logs.length} lines` },
			)}
		</div>
	`;

	return renderLayout('Control Panel', content, i18n, lang, true, 'ops');
}

export function renderLogTail(logs: readonly string[]): string {
	if (logs.length === 0) {
		return '<div class="log-view"><p class="muted">No log lines found for today.</p></div>';
	}

	return `
		<div class="log-view">
			<pre class="log-pre">${logs.map((line) => escapeHtml(line)).join('\n')}</pre>
		</div>`;
}

function renderActionGroup(title: string, description: string, actions: string): string {
	return `
		<section class="control-action-row">
			<div class="control-action-copy">
				<h3>${escapeHtml(title)}</h3>
				<p>${escapeHtml(description)}</p>
			</div>
			<div class="actions actions-right">${actions}</div>
		</section>`;
}
