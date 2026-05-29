import type { Context } from 'hono';

export interface CookieOptions {
	path?: string;
	maxAge?: number;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: 'Lax' | 'Strict' | 'None';
}

export function getCookie(c: Context, name: string): string | undefined {
	const cookies = c.req.header('cookie');
	if (!cookies) return undefined;

	for (const cookie of cookies.split(';')) {
		const separatorIndex = cookie.indexOf('=');
		if (separatorIndex === -1) continue;
		const key = cookie.slice(0, separatorIndex).trim();
		const value = cookie.slice(separatorIndex + 1).trim();
		if (key !== name) continue;

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}

	return undefined;
}

export function setCookie(
	c: Context,
	name: string,
	value: string,
	options: CookieOptions = {},
): void {
	const parts = [`${name}=${encodeURIComponent(value)}`];
	parts.push(`Path=${options.path ?? '/'}`);
	if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
	if (options.httpOnly) parts.push('HttpOnly');
	if (options.secure) parts.push('Secure');
	parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);

	c.header('Set-Cookie', parts.join('; '), { append: true });
}

export function clearCookie(c: Context, name: string, options: CookieOptions = {}): void {
	setCookie(c, name, '', {
		path: options.path ?? '/',
		httpOnly: options.httpOnly,
		secure: options.secure,
		sameSite: options.sameSite ?? 'Lax',
		maxAge: 0,
	});
}
