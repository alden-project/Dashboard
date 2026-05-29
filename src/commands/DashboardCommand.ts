import { CommandBase, CommandContext } from '@/api';
import { ThreadType } from 'zca-js';
import type Main from '../main';

export class DashboardCommand extends CommandBase {
	public constructor(private readonly plugin: Main) {
		super({
			name: 'dashboard',
			description: 'dashboard.desc',
			aliases: ['dash'],
			cooldown: 30,
			usage: 'dashboard.usage',
			permission: 'dashboard.access',
		});
	}

	public async execute(ctx: CommandContext): Promise<void> {
		const { message, lang } = ctx;
		if (message.type !== ThreadType.User) {
			await ctx.reply(ctx.t('dashboard.otp.dm_only'));
			return;
		}

		const userId = message.data.uidFrom;
		const scope = await this.plugin.accessService.resolveUserScope(userId, { refresh: true });
		if (!scope) {
			await ctx.reply(ctx.t('dashboard.otp.no_access'));
			return;
		}

		const otp = this.plugin.otpManager.generate(userId);
		const url = getDashboardUrl(this.plugin);

		await ctx.reply(ctx.t('dashboard.otp.message', { otp, url }));
	}
}

function getDashboardUrl(plugin: Main): string {
	const publicUrl = plugin.config.get('publicUrl').trim();
	if (publicUrl) return publicUrl.replace(/\/+$/, '');

	const host = plugin.config.get('host');
	const displayHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
	return `http://${displayHost}:${plugin.config.get('port')}`;
}
