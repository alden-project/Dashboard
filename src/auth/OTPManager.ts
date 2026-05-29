import { randomInt, createHash } from 'node:crypto';

interface OTPEntry {
	userId: string;
	expiresAt: number;
}

export class OTPManager {
	private readonly otps = new Map<string, OTPEntry>();
	private cleanupTimer?: NodeJS.Timeout;

	public constructor(private readonly ttlMs: number) {
		this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
	}

	public generate(userId: string): string {
		const code = randomInt(10000000, 99999999).toString();
		const hash = this.hash(code);

		this.otps.set(hash, {
			userId,
			expiresAt: Date.now() + this.ttlMs,
		});

		return code;
	}

	public verify(code: string): string | undefined {
		const hash = this.hash(code);
		const entry = this.otps.get(hash);

		if (!entry) return undefined;
		if (Date.now() > entry.expiresAt) {
			this.otps.delete(hash);
			return undefined;
		}

		this.otps.delete(hash);
		return entry.userId;
	}

	public stop(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = undefined;
		}
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [hash, entry] of this.otps) {
			if (now > entry.expiresAt) {
				this.otps.delete(hash);
			}
		}
	}

	private hash(code: string): string {
		return createHash('sha256').update(code).digest('hex');
	}
}
