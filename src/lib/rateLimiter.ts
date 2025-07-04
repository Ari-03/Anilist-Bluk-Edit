export interface RateLimiterConfig {
    maxRequestsPerSecond: number
    maxConcurrentRequests: number
    backoffMultiplier: number
    maxRetries: number
    initialRetryDelay: number
}

export interface RateLimiterStats {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    retriedRequests: number
    rateLimitHits: number
    averageResponseTime: number
    currentQueueSize: number
}

export class RateLimiter {
    private config: RateLimiterConfig
    private requestQueue: Array<() => Promise<any>> = []
    private activeRequests = 0
    private requestTimes: number[] = []
    private stats: RateLimiterStats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        retriedRequests: 0,
        rateLimitHits: 0,
        averageResponseTime: 0,
        currentQueueSize: 0
    }
    private processing = false

    constructor(config: Partial<RateLimiterConfig> = {}) {
        this.config = {
            maxRequestsPerSecond: 0.5, // AniList currently limited to 30 requests per minute (0.5/sec) due to degraded state
            maxConcurrentRequests: 2,  // Reduced concurrent requests to be more conservative
            backoffMultiplier: 2,
            maxRetries: 3,
            initialRetryDelay: 2000,   // Increased initial delay
            ...config
        }
    }

    async execute<T>(requestFn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.requestQueue.push(async () => {
                try {
                    const result = await this.executeWithRetry(requestFn)
                    resolve(result)
                } catch (error) {
                    reject(error)
                }
            })
            this.stats.currentQueueSize = this.requestQueue.length
            this.processQueue()
        })
    }

    private async executeWithRetry<T>(requestFn: () => Promise<T>, retryCount = 0): Promise<T> {
        const startTime = Date.now()

        try {
            this.stats.totalRequests++

            // Wait for rate limit compliance
            await this.waitForRateLimit()

            const result = await requestFn()

            this.stats.successfulRequests++
            this.updateResponseTime(Date.now() - startTime)

            return result
        } catch (error: any) {
            this.stats.failedRequests++

            // Check if it's a rate limit error
            if (this.isRateLimitError(error) && retryCount < this.config.maxRetries) {
                this.stats.rateLimitHits++
                this.stats.retriedRequests++

                const delay = this.config.initialRetryDelay * Math.pow(this.config.backoffMultiplier, retryCount)
                console.warn(`Rate limit hit, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.config.maxRetries})`)

                await this.delay(delay)
                return this.executeWithRetry(requestFn, retryCount + 1)
            }

            // Check if it's a network error that should be retried
            if (this.isRetryableError(error) && retryCount < this.config.maxRetries) {
                this.stats.retriedRequests++

                const delay = this.config.initialRetryDelay * Math.pow(this.config.backoffMultiplier, retryCount)
                console.warn(`Request failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.config.maxRetries})`)

                await this.delay(delay)
                return this.executeWithRetry(requestFn, retryCount + 1)
            }

            throw error
        }
    }

    private async processQueue(): Promise<void> {
        if (this.processing) return
        this.processing = true

        while (this.requestQueue.length > 0 && this.activeRequests < this.config.maxConcurrentRequests) {
            const requestFn = this.requestQueue.shift()
            if (!requestFn) continue

            this.activeRequests++
            this.stats.currentQueueSize = this.requestQueue.length

            requestFn()
                .finally(() => {
                    this.activeRequests--
                    this.processQueue()
                })
        }

        this.processing = false
    }

    private async waitForRateLimit(): Promise<void> {
        const now = Date.now()
        const oneSecondAgo = now - 1000

        // Remove old request times
        this.requestTimes = this.requestTimes.filter(time => time > oneSecondAgo)

        // If we're at the limit, wait
        if (this.requestTimes.length >= this.config.maxRequestsPerSecond) {
            const oldestRequest = Math.min(...this.requestTimes)
            const waitTime = 1000 - (now - oldestRequest)
            if (waitTime > 0) {
                await this.delay(waitTime)
            }
        }

        this.requestTimes.push(now)
    }

    private isRateLimitError(error: any): boolean {
        return error?.response?.status === 429 ||
            error?.status === 429 ||
            error?.message?.toLowerCase().includes('rate limit') ||
            error?.message?.toLowerCase().includes('too many requests')
    }

    private isRetryableError(error: any): boolean {
        const retryableStatuses = [500, 502, 503, 504]
        return retryableStatuses.includes(error?.response?.status) ||
            retryableStatuses.includes(error?.status) ||
            error?.code === 'ECONNRESET' ||
            error?.code === 'ETIMEDOUT'
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    private updateResponseTime(responseTime: number): void {
        const totalTime = this.stats.averageResponseTime * this.stats.successfulRequests + responseTime
        this.stats.averageResponseTime = totalTime / (this.stats.successfulRequests + 1)
    }

    getStats(): RateLimiterStats {
        return { ...this.stats }
    }

    getConfig(): RateLimiterConfig {
        return { ...this.config }
    }

    updateConfig(newConfig: Partial<RateLimiterConfig>): void {
        this.config = { ...this.config, ...newConfig }
    }

    reset(): void {
        this.requestQueue = []
        this.activeRequests = 0
        this.requestTimes = []
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retriedRequests: 0,
            rateLimitHits: 0,
            averageResponseTime: 0,
            currentQueueSize: 0
        }
    }
} 