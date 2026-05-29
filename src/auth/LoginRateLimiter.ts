interface AttemptEntry {
	count: number;
	resetAt: number;
}

export class LoginRateLimiter {
	private readonly attempts = new Map<string, AttemptEntry>();
	private cleanupTimer?: NodeJS.Timeout;

	public constructor(
		private readonly maxAttempts: number,
		private readonly windowMs: number,
	) {
		this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
		this.cleanupTimer.unref?.();
	}

	public getRetryAfterSeconds(key: string): number | null {
		const entry = this.attempts.get(key);
		if (!entry) return null;

		const now = Date.now();
		if (now > entry.resetAt) {
			this.attempts.delete(key);
			return null;
		}

		if (entry.count < this.maxAttempts) return null;
		return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
	}

	public recordFailure(key: string): void {
		const now = Date.now();
		const entry = this.attempts.get(key);
		if (!entry || now > entry.resetAt) {
			this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
			return;
		}

		entry.count++;
	}

	public clear(key: string): void {
		this.attempts.delete(key);
	}

	public stop(): void {
		if (!this.cleanupTimer) return;
		clearInterval(this.cleanupTimer);
		this.cleanupTimer = undefined;
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.attempts) {
			if (now > entry.resetAt) {
				this.attempts.delete(key);
			}
		}
	}
}
