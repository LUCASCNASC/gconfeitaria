export class LoginRateStore {
  constructor(pool) {
    this.pool = pool
  }

  init(options) {
    this.windowMs = options.windowMs
  }

  async increment(key) {
    await this.pool.query("DELETE FROM login_rate_limits WHERE reset_at < NOW() - INTERVAL '24 hours'")
    await this.pool.query('DELETE FROM user_sessions WHERE expire < NOW()')
    const result = await this.pool.query(
      `INSERT INTO login_rate_limits (key, hits, reset_at)
       VALUES ($1, 1, NOW() + $2 * INTERVAL '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE WHEN login_rate_limits.reset_at <= NOW() THEN 1 ELSE login_rate_limits.hits + 1 END,
         reset_at = CASE WHEN login_rate_limits.reset_at <= NOW() THEN NOW() + $2 * INTERVAL '1 millisecond' ELSE login_rate_limits.reset_at END
       RETURNING hits, reset_at`,
      [key, this.windowMs],
    )
    return { totalHits: result.rows[0].hits, resetTime: result.rows[0].reset_at }
  }

  async decrement(key) {
    await this.pool.query('UPDATE login_rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = $1', [key])
  }

  async resetKey(key) {
    await this.pool.query('DELETE FROM login_rate_limits WHERE key = $1', [key])
  }
}
