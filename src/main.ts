import path from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { ConfigProvider, I18nManager, PluginBase } from '@/api';
import { DashboardCommand } from './commands/DashboardCommand';
import { OTPManager } from './auth/OTPManager';
import { SessionManager } from './auth/SessionManager';
import { createAuthMiddleware, csrfProtection } from './auth/middleware';
import { GroupTracker } from './services/GroupTracker';
import { GroupService } from './services/GroupService';
import { BotService } from './services/BotService';
import { DashboardAccessService } from './services/DashboardAccessService';
import { createAuthRoutes } from './routes/auth';
import { createGroupRoutes } from './routes/groups';
import { createPluginRoutes } from './routes/plugins';
import { createPermissionRoutes } from './routes/permissions';
import { createConfigRoutes } from './routes/config';
import { createStatusRoutes } from './routes/status';
import { createOpsRoutes } from './routes/ops';
import { createAssetRoutes } from './routes/assets';
import { renderLogin } from './views/login';
import { LoginRateLimiter } from './auth/LoginRateLimiter';

export type DashboardConfig = {
	port: number;
	host: string;
	publicUrl: string;
	secureCookies: boolean;
	trustProxy: boolean;
	sessionTTL: number;
	otpTTL: number;
	maxSessions: number;
	logTailLines: number;
};

const DEFAULT_CONFIG: DashboardConfig = {
	port: 3000,
	host: '0.0.0.0',
	publicUrl: '',
	secureCookies: false,
	trustProxy: false,
	sessionTTL: 7 * 24 * 60 * 60 * 1000,
	otpTTL: 5 * 60 * 1000,
	maxSessions: 50,
	logTailLines: 200,
};

export default class Main extends PluginBase {
	public config!: ConfigProvider<DashboardConfig>;
	public otpManager!: OTPManager;
	public sessionManager!: SessionManager;
	public groupTracker!: GroupTracker;
	public groupService!: GroupService;
	public botService!: BotService;
	public accessService!: DashboardAccessService;
	public loginRateLimiter!: LoginRateLimiter;

	private server?: ReturnType<typeof serve>;
	private app!: Hono;

	public async onEnable(): Promise<void> {
		await this.saveResources(['locales/vi.json', 'locales/en.json']);

		this.config = new ConfigProvider<DashboardConfig>(
			path.join(this.dataFolder, 'config.json'),
			DEFAULT_CONFIG,
		);
		await this.config.load();

		this.i18n = new I18nManager(
			path.join(this.dataFolder, 'locales'),
			this.bot.config.LANGUAGE,
		);
		await this.i18n.loadLocales();

		this.otpManager = new OTPManager(this.config.get('otpTTL'));
		this.sessionManager = new SessionManager(
			path.join(this.dataFolder, 'sessions.json'),
			this.config.get('sessionTTL'),
			this.config.get('maxSessions'),
			this.logger,
		);
		await this.sessionManager.load();
		this.loginRateLimiter = new LoginRateLimiter(5, 5 * 60 * 1000);

		this.groupTracker = new GroupTracker(this, path.join(this.dataFolder, 'known-groups.json'));
		await this.groupTracker.load();
		this.groupService = new GroupService(this);
		await this.groupService.loadLinks();
		this.botService = new BotService(this);
		this.accessService = new DashboardAccessService(this);

		this.app = new Hono();
		this.setupMiddleware();
		this.setupRoutes();

		this.registerCommand(new DashboardCommand(this));

		const port = this.config.get('port');
		const host = this.config.get('host');

		this.server = serve({ fetch: this.app.fetch, port, hostname: host });
		this.server.on('error', (error: Error) => {
			this.logger.error(
				`Failed to start dashboard server on port ${port}. Is the port already in use?`,
				error,
			);
		});

		this.logger.info(`Dashboard server started at http://${host}:${port}`);
	}

	public async onDisable(): Promise<void> {
		if (this.server) {
			this.server.close();
			this.logger.info('Dashboard server stopped.');
		}
		this.otpManager.stop();
		this.sessionManager.stop();
		this.loginRateLimiter?.stop();
		this.groupTracker.stop();
		await this.sessionManager.save();
		await this.groupTracker.save();
	}

	private setupMiddleware(): void {
		this.app.use('*', createAuthMiddleware(this));
		this.app.use('*', csrfProtection);
	}

	private setupRoutes(): void {
		this.app.route('/', createAuthRoutes(this));
		this.app.route('/', createGroupRoutes(this));
		this.app.route('/', createPluginRoutes(this));
		this.app.route('/', createPermissionRoutes(this));
		this.app.route('/', createConfigRoutes(this));
		this.app.route('/', createStatusRoutes(this));
		this.app.route('/', createOpsRoutes(this));
		this.app.route('/', createAssetRoutes(this));

		this.app.get('/', (c) => {
			const session = c.get('session');
			if (!session) {
				return c.html(renderLogin(this.i18n!, this.bot.config.LANGUAGE));
			}
			return c.redirect('/dashboard');
		});
	}
}
