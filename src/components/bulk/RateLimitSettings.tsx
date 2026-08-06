import { RateLimiterStats } from '@/lib/rateLimiter'
import { RateLimiterConfig } from '@/hooks/useBulkOperations'
import { Activity, Info } from 'lucide-react'

interface RateLimitSettingsProps {
    config: RateLimiterConfig
    onChange: (config: RateLimiterConfig) => void
    stats: RateLimiterStats | null
    disabled?: boolean
}

export default function RateLimitSettings({ config, onChange, stats, disabled }: RateLimitSettingsProps) {
    const field = (
        label: string,
        key: keyof RateLimiterConfig,
        opts: { min: number; max: number; step?: number; parse?: (v: string) => number }
    ) => (
        <div>
            <label className="block text-xs font-medium text-fg-muted mb-1">{label}</label>
            <input
                type="number"
                className="input h-8 text-xs"
                value={config[key]}
                min={opts.min}
                max={opts.max}
                step={opts.step ?? 1}
                disabled={disabled}
                onChange={(e) => {
                    const parse = opts.parse ?? parseFloat
                    const v = parse(e.target.value)
                    if (!isNaN(v)) onChange({ ...config, [key]: Math.max(opts.min, Math.min(opts.max, v)) })
                }}
            />
        </div>
    )

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {field('Requests / second', 'maxRequestsPerSecond', { min: 0.1, max: 1, step: 0.1 })}
                {field('Concurrent', 'maxConcurrentRequests', { min: 1, max: 2, parse: (v) => parseInt(v) })}
                {field('Max retries', 'maxRetries', { min: 0, max: 10, parse: (v) => parseInt(v) })}
                {field('Retry delay (ms)', 'initialRetryDelay', { min: 100, max: 10000, step: 100, parse: (v) => parseInt(v) })}
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-accent/5 border border-accent/20 p-2.5">
                <Info className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-fg-muted">
                    AniList currently allows ~30 requests/minute (degraded from the usual 90). Each
                    request batches up to 10 entries, so the defaults are plenty fast and safe.
                </p>
            </div>

            {stats && stats.totalRequests > 0 && (
                <div className="rounded-lg bg-raised p-3">
                    <h6 className="text-xs font-semibold text-fg mb-2 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        Last run
                    </h6>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px] tabular-nums">
                        <div>
                            <div className="text-fg-subtle">Requests</div>
                            <div className="font-medium text-fg">{stats.totalRequests}</div>
                        </div>
                        <div>
                            <div className="text-fg-subtle">OK</div>
                            <div className="font-medium text-success">{stats.successfulRequests}</div>
                        </div>
                        <div>
                            <div className="text-fg-subtle">Failed</div>
                            <div className="font-medium text-danger">{stats.failedRequests}</div>
                        </div>
                        <div>
                            <div className="text-fg-subtle">429 hits</div>
                            <div className="font-medium text-warning">{stats.rateLimitHits}</div>
                        </div>
                        <div>
                            <div className="text-fg-subtle">Retries</div>
                            <div className="font-medium text-fg">{stats.retriedRequests}</div>
                        </div>
                        <div>
                            <div className="text-fg-subtle">Avg time</div>
                            <div className="font-medium text-fg">{Math.round(stats.averageResponseTime)}ms</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
