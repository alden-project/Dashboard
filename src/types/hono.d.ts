declare module 'hono' {
	export interface ContextRequest {
		readonly method: string;
		readonly url: string;
		header(name: string): string | undefined;
		param(name: string): string;
		parseBody(): Promise<Record<string, FormDataEntryValue | FormDataEntryValue[]>>;
	}

	export interface ContextVariableMap {}

	export interface Context {
		readonly req: ContextRequest;
		get<K extends keyof ContextVariableMap>(key: K): ContextVariableMap[K];
		get<T = unknown>(key: string): T;
		set<K extends keyof ContextVariableMap>(key: K, value: ContextVariableMap[K]): void;
		set(key: string, value: unknown): void;
		header(name: string, value: string, options?: { append?: boolean }): void;
		html(value: string, status?: number): Response;
		text(value: string, status?: number): Response;
		redirect(location: string, status?: number): Response;
		body(value: BodyInit | null, status?: number): Response;
	}

	export type Next = () => Promise<void>;
	export type Handler = (c: Context, next: Next) => Response | void | Promise<Response | void>;

	export class Hono {
		public readonly fetch: (request: Request) => Response | Promise<Response>;
		use(path: string, handler: Handler): this;
		use(handler: Handler): this;
		get(path: string, handler: Handler): this;
		post(path: string, handler: Handler): this;
		route(path: string, app: Hono): this;
	}
}

declare module 'hono/cors' {
	import type { Handler } from 'hono';

	export function cors(): Handler;
}

declare module 'hono/streaming' {
	import type { Context } from 'hono';

	export interface SSEStreamingApi {
		writeSSE(options: { event?: string; data: string }): Promise<void>;
		onAbort(callback: () => void): void;
	}

	export function streamSSE(
		context: Context,
		callback: (stream: SSEStreamingApi) => Promise<void> | void,
	): Response;
}

declare module '@hono/node-server' {
	export interface ServerHandle {
		on(event: 'error', callback: (error: Error) => void): void;
		close(): void;
	}

	export function serve(options: {
		fetch: (request: Request) => Response | Promise<Response>;
		port: number;
		hostname: string;
	}): ServerHandle;
}
