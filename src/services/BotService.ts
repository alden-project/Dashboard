import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type Main from '../main';
import {
	AWAKE_EXIT_CODE,
	formatReleaseDate,
	formatUptime,
	PATH,
	Role,
	createLauncherRequest,
	isDockerRuntime,
	isLauncherManaged,
	requestLauncherRestart,
	sendLauncherRequest,
	UpdateService,
	writeLauncherRequest,
} from '@/api';

export interface PluginInfo {
	name: string;
	version: string;
	description: string;
	author: string;
	enabled: boolean;
}

export interface PermissionNode {
	node: string;
	level: Role;
	levelName: string;
}

export interface UserPermission {
	userId: string;
	permissions: string[];
}

export interface BotStatus {
	version: string;
	uptime: number;
	uptimeFormatted: string;
	memory: {
		rss: number;
		heapTotal: number;
		heapUsed: number;
	};
	os: {
		type: string;
		release: string;
		arch: string;
		freeMem: number;
		totalMem: number;
	};
	node: string;
	cpu: string;
	pluginCount: number;
	groupCount: number;
}

export interface BotConfigData {
	prefix: string;
	adminIds: string[];
	language: string;
	replyUnknownCommand: boolean;
	version: string;
}

export interface OperationResult {
	ok: boolean;
	message: string;
}

export class BotService {
	constructor(private readonly plugin: Main) {}

	public getPlugins(): PluginInfo[] {
		const plugins = this.plugin.bot.pluginManager.getPlugins();
		const result: PluginInfo[] = [];

		for (const [name, plugin] of plugins) {
			result.push({
				name,
				version: plugin.description.version,
				description: plugin.description.description,
				author: plugin.description.author,
				enabled: this.plugin.bot.pluginManager.isPluginEnabled(name),
			});
		}

		return result;
	}

	public async reloadAll(): Promise<boolean> {
		try {
			const pm = this.plugin.bot.pluginManager;
			await pm.unloadAll();
			await pm.loadAll(path.dirname(this.plugin.pluginPath));
			await pm.enableAll();
			return true;
		} catch (error) {
			this.plugin.logger.error('Dashboard failed to reload plugins', error);
			return false;
		}
	}

	public getPermissionNodes(): PermissionNode[] {
		const permissions = this.plugin.bot.permissionManager.getAllPermissions();

		return permissions.map((permission: string) => ({
			node: permission,
			level: this.plugin.bot.permissionManager.getPermissionRole(permission),
			levelName:
				Role[this.plugin.bot.permissionManager.getPermissionRole(permission)] ?? 'Unknown',
		}));
	}

	public async grantPermission(userId: string, permission: string): Promise<boolean> {
		return await this.plugin.bot.permissionManager.grant(userId, permission);
	}

	public async revokePermission(userId: string, permission: string): Promise<boolean> {
		return await this.plugin.bot.permissionManager.revoke(userId, permission);
	}

	public getUserPermissions(userId: string): string[] {
		return this.plugin.bot.permissionManager.getUserPermissions(userId);
	}

	public async addVirtualDeputy(threadId: string, userId: string): Promise<boolean> {
		return await this.plugin.bot.permissionManager.addVirtualDeputy(threadId, userId);
	}

	public async removeVirtualDeputy(threadId: string, userId: string): Promise<boolean> {
		return await this.plugin.bot.permissionManager.removeVirtualDeputy(threadId, userId);
	}

	public getStatus(): BotStatus {
		const mem = process.memoryUsage();
		const uptimeSec = process.uptime();

		return {
			version: this.plugin.bot.config.version,
			uptime: uptimeSec,
			uptimeFormatted: formatUptime(uptimeSec),
			memory: {
				rss: Math.round(mem.rss / 1024 / 1024),
				heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
				heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
			},
			os: {
				type: os.type(),
				release: os.release(),
				arch: os.arch(),
				freeMem: Math.round(os.freemem() / 1024 / 1024),
				totalMem: Math.round(os.totalmem() / 1024 / 1024),
			},
			node: process.version,
			cpu: os.cpus()[0]?.model || 'Unknown',
			pluginCount: this.plugin.bot.pluginManager.getPlugins().size,
			groupCount: this.plugin.groupTracker.getAllGroupIds().length,
		};
	}

	public getConfig(): BotConfigData {
		return {
			prefix: this.plugin.bot.config.PREFIX,
			adminIds: [...this.plugin.bot.config.ADMIN_IDS],
			language: this.plugin.bot.config.LANGUAGE,
			replyUnknownCommand: this.plugin.bot.config.REPLY_UNKNOWN_COMMAND,
			version: this.plugin.bot.config.version,
		};
	}

	public async checkUpdate(): Promise<OperationResult> {
		const result = await new UpdateService({ packageJsonPath: PATH.PACKAGE_JSON }).check(
			this.plugin.bot.config.version,
		);

		switch (result.status) {
			case 'available':
				return {
					ok: true,
					message: `Update available: v${result.currentVersion} -> v${result.latestVersion ?? 'unknown'} (${formatReleaseDate(result.release?.publishedAt)}).`,
				};
			case 'up-to-date':
				return {
					ok: true,
					message: `alden-bot is up to date at v${result.currentVersion}.`,
				};
			case 'ahead':
				return {
					ok: true,
					message: `Current version v${result.currentVersion} is ahead of latest release v${result.latestVersion ?? 'unknown'}.`,
				};
			case 'unavailable':
				return {
					ok: false,
					message: `Update check unavailable: ${result.error ?? 'unknown error'}.`,
				};
		}
	}

	public async applyUpdate(): Promise<OperationResult> {
		if (isDockerRuntime()) {
			return {
				ok: false,
				message:
					'Docker runtime detected. Pull/rebuild the image and restart the container instead of applying in-place updates.',
			};
		}

		if (!isLauncherManaged()) {
			return {
				ok: false,
				message:
					'Update apply requires launcher-managed startup. Start alden-bot with pnpm start.',
			};
		}

		const preparation = await new UpdateService({
			packageJsonPath: PATH.PACKAGE_JSON,
		}).prepareApply(this.plugin.bot.config.version);

		if (preparation.check.status !== 'available' || !preparation.check.release) {
			return this.checkUpdate();
		}

		if (!preparation.assets) {
			return {
				ok: false,
				message: `Release v${preparation.check.latestVersion ?? 'unknown'} is missing the required zip and SHA256 assets.`,
			};
		}

		const request = createLauncherRequest('update', {
			reason: 'dashboard update apply',
			release: {
				version: preparation.check.release.version,
				tagName: preparation.check.release.tagName,
				releaseUrl: preparation.check.release.releaseUrl,
				assetName: preparation.assets.assetName,
				assetUrl: preparation.assets.assetUrl,
				checksumAssetName: preparation.assets.checksumAssetName,
				checksumUrl: preparation.assets.checksumUrl,
			},
		});

		await writeLauncherRequest(request);
		sendLauncherRequest(request);
		this.requestGracefulRestart('dashboard update apply');

		return {
			ok: true,
			message: `Update to v${preparation.check.release.version} queued. alden-bot is restarting through AWAKE.`,
		};
	}

	public async restart(): Promise<OperationResult> {
		if (isLauncherManaged()) {
			await requestLauncherRestart('dashboard restart');
			this.requestGracefulRestart('dashboard restart');
			return {
				ok: true,
				message: 'Restart requested through AWAKE launcher.',
			};
		}

		setTimeout(() => {
			process.emit('SIGTERM');
		}, 1000);

		return {
			ok: true,
			message:
				'Restart requested. Direct runs need an external supervisor if the process should start again automatically.',
		};
	}

	public async getRecentLogs(lines: number): Promise<string[]> {
		const filePath = path.join(PATH.LOGS_DIR, `bot-${getDateString()}.log`);
		try {
			const content = await fsp.readFile(filePath, 'utf-8');
			return content.trimEnd().split(/\r?\n/).slice(-Math.max(1, lines));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
			this.plugin.logger.error('Dashboard failed to read logs', error);
			return [];
		}
	}

	private requestGracefulRestart(reason: string): void {
		this.plugin.logger.info(`${reason}. Triggering AWAKE restart...`);
		process.exitCode = AWAKE_EXIT_CODE;
		setTimeout(() => {
			process.emit('SIGTERM');
		}, 1000);
	}
}

function getDateString(): string {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
