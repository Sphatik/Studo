/**
 * Generic in-memory cooldown tracker.
 * Keys are arbitrary strings (e.g. `userId`, `userId_guildId`).
 */
export class Cooldown {
    private readonly timestamps = new Map<string, number>();
    private readonly durationMs: number;

    constructor(durationMs: number) {
        this.durationMs = durationMs;
    }

    /** Returns true if the key is on cooldown. */
    isOnCooldown(key: string): boolean {
        const last = this.timestamps.get(key);
        return last !== undefined && Date.now() - last < this.durationMs;
    }

    /** Record a usage for the key, starting the cooldown. */
    set(key: string): void {
        this.timestamps.set(key, Date.now());
    }

    /** Clear the cooldown for a key. */
    clear(key: string): void {
        this.timestamps.delete(key);
    }
}
