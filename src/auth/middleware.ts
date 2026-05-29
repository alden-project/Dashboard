import type { Context, Next } from 'hono';
import type { Session } from './SessionManager';
import type Main from '../main';
import { Role } from '@/api';
import { clearCookie, getCookie, setCookie } from './cookies';

declare module 'hono' {
	interface ContextVariableMap {
		session: Session | undefined;
		csrfToken: string | undefined;
	}
}

export function createAuthMiddleware(plugin: Main) {
	return async (c: Context, next: Next): Promise<void> => {
		const token = getCookie(c, 'dashboard_session');

		if (token) {
			const session = plugin.sessionManager.validate(token);
			c.set('session', session);

			if (session) {
				c.set('csrfToken', session.csrfToken);
				setCsrfCookie(c, plugin, session.csrfToken);
			}
		} else {
			c.set('session', undefined);
		}

		await next();
	};
}

export async function csrfProtection(c: Context, next: Next): Promise<Response | void> {
	const method = c.req.method;
	if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
		const session = c.get('session');
		if (session) {
			const headerToken = c.req.header('X-CSRF-Token');

			if (!headerToken) {
				return c.text('CSRF token missing', 403);
			}

			if (session.csrfToken !== headerToken) {
				return c.text('CSRF token mismatch', 403);
			}
		}
	}
	await next();
}

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
	const session = c.get('session');
	if (!session) {
		return c.redirect('/login');
	}
	await next();
}

export function requireAdmin(plugin: Main) {
	return async (c: Context, next: Next): Promise<Response | void> => {
		const session = c.get('session');
		if (!session) {
			return c.redirect('/login');
		}

		const scope = await plugin.accessService.resolveSessionScope(session, { refresh: true });
		if (!scope) {
			return expireDashboardSession(c, plugin);
		}
		if (!scope.isBotAdmin) {
			return c.html(renderForbidden(), 403);
		}

		await next();
	};
}

export async function expireDashboardSession(
	c: Context,
	plugin: Main,
	message = 'Your dashboard access has expired or changed. Request a new OTP if you still manage a group.',
): Promise<Response> {
	const token = getCookie(c, 'dashboard_session');
	const session = c.get('session');
	if (token) {
		await plugin.sessionManager.revoke(token);
	} else if (session) {
		await plugin.sessionManager.revoke(session.token);
	}

	const secure = shouldUseSecureCookie(c, plugin);
	clearCookie(c, 'dashboard_session', { httpOnly: true, secure, sameSite: 'Lax' });
	clearCookie(c, 'csrf_token', { secure, sameSite: 'Strict' });
	return c.html(renderAccessExpired(message), 403);
}

function setCsrfCookie(c: Context, plugin: Main, token: string): void {
	const maxAge = Math.floor(plugin.config.get('sessionTTL') / 1000);
	setCookie(c, 'csrf_token', token, {
		maxAge,
		secure: shouldUseSecureCookie(c, plugin),
		sameSite: 'Strict',
	});
}

export function shouldUseSecureCookie(c: Context, plugin: Main): boolean {
	if (plugin.config.get('secureCookies')) return true;
	if (!plugin.config.get('trustProxy')) return false;
	return c.req.header('x-forwarded-proto') === 'https';
}

function renderForbidden(): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>403 - Forbidden</title>
	<link rel="stylesheet" href="/assets/dashboard.css">
</head>
<body>
	<main class="login-page">
		<section class="login-card">
			<div class="login-brand">
				<h1 class="login-title">403</h1>
				<p class="login-subtitle">You don't have permission to access this page.</p>
			</div>
		<a href="/dashboard" class="btn btn-primary">
			Back to Dashboard
		</a>
		</section>
	</main>
</body>
</html>`;
}

function renderAccessExpired(message: string): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Access expired - alden-bot Dashboard</title>
	<link rel="stylesheet" href="/assets/dashboard.css">
</head>
<body>
	<main class="login-page">
		<section class="login-card">
			<div class="login-brand">
				<h1 class="login-title">Access expired</h1>
				<p class="login-subtitle">${escapeHtml(message)}</p>
			</div>
			<a href="/login" class="btn btn-primary btn-block">Back to login</a>
		</section>
	</main>
</body>
</html>`;
}

function escapeHtml(value: unknown): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
