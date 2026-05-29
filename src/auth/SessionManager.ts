import { createHash, randomBytes } from 'node:crypto';
import { readJsonFileAsync, Role, writeJsonFileAsync, type Logger } from '@/api';

export interface Session {
	token: string;
	userId: string;
	role: Role;
	groupIds: string[];
	createdAt: number;
	expiresAt: number;
	csrfToken: string;
}

interface StoredSession {
	userId: string;
	role: Role;
	groupIds: string[];
	createdAt: number;
	expiresAt: number;
	csrfToken: string;
}

interface SessionFile {
	sessions: Record<string, StoredSession>;
}

export class SessionManager {
	private readonly sessions = new Map<string, Session>();
	private cleanupTimer?: NodeJS.Timeout;

	public constructor(
		private readonly dataPath: string,
		private readonly ttlMs: number,
		private readonly maxSessions: number,
		private readonly logger: Logger,
	) {
		this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
	}

	public async load(): Promise<void> {
		const data = await readJsonFileAsync<SessionFile>(this.dataPath);
		if (!data?.sessions) return;

		const now = Date.now();
		for (const [hash, stored] of Object.entries(data.sessions)) {
			if (!isStoredSession(stored)) continue;
			if (stored.expiresAt <= now) continue;

			this.sessions.set(hash, {
				token: hash,
				userId: stored.userId,
				role: stored.role,
				groupIds: stored.groupIds,
				createdAt: stored.createdAt,
				expiresAt: stored.expiresAt,
				csrfToken: stored.csrfToken,
			});
		}
	}

	public async save(): Promise<void> {
		const sessions: Record<string, StoredSession> = {};
		for (const [, session] of this.sessions) {
			sessions[session.token] = {
				userId: session.userId,
				role: session.role,
				groupIds: session.groupIds,
				createdAt: session.createdAt,
				expiresAt: session.expiresAt,
				csrfToken: session.csrfToken,
			};
		}
		await writeJsonFileAsync(this.dataPath, { sessions });
	}

	public async create(
		userId: string,
		role: Role,
		groupIds: string[],
	): Promise<{ token: string; csrfToken: string }> {
		if (this.sessions.size >= this.maxSessions) {
			this.evictOldest();
		}

		const token = randomBytes(32).toString('hex');
		const hash = this.hashToken(token);
		const csrfToken = randomBytes(32).toString('hex');

		const now = Date.now();
		this.sessions.set(hash, {
			token: hash,
			userId,
			role,
			groupIds,
			createdAt: now,
			expiresAt: now + this.ttlMs,
			csrfToken,
		});

		await this.save();
		return { token, csrfToken };
	}

	public validate(token: string): Session | undefined {
		const hash = this.hashToken(token);
		const session = this.sessions.get(hash);

		if (!session) return undefined;
		if (Date.now() > session.expiresAt) {
			this.sessions.delete(hash);
			return undefined;
		}

		session.expiresAt = Date.now() + this.ttlMs;
		return session;
	}

	public async revoke(token: string): Promise<void> {
		const hash = this.hashToken(token);
		if (!this.sessions.delete(hash)) {
			this.sessions.delete(token);
		}
		await this.save();
	}

	public async revokeAllForUser(userId: string): Promise<void> {
		for (const [hash, session] of this.sessions) {
			if (session.userId === userId) {
				this.sessions.delete(hash);
			}
		}
		await this.save();
	}

	public stop(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [hash, session] of this.sessions) {
			if (now > session.expiresAt) {
				this.sessions.delete(hash);
			}
		}
		this.save().catch((err) =>
			this.logger.error('Dashboard session save failed during cleanup', err),
		);
	}

	private evictOldest(): void {
		let oldestHash: string | undefined;
		let oldestTime = Infinity;

		for (const [hash, session] of this.sessions) {
			if (session.createdAt < oldestTime) {
				oldestTime = session.createdAt;
				oldestHash = hash;
			}
		}

		if (oldestHash) {
			this.sessions.delete(oldestHash);
		}
	}

	private hashToken(token: string): string {
		return createHash('sha256').update(token).digest('hex');
	}
}

function isStoredSession(value: unknown): value is StoredSession {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<StoredSession>;
	return (
		typeof candidate.userId === 'string' &&
		typeof candidate.role === 'number' &&
		Array.isArray(candidate.groupIds) &&
		candidate.groupIds.every((groupId) => typeof groupId === 'string') &&
		typeof candidate.createdAt === 'number' &&
		typeof candidate.expiresAt === 'number' &&
		typeof candidate.csrfToken === 'string'
	);
}
