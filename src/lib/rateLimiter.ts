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
    private responseTimes: number[] = []
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
                    // Track that we're starting a new request (not a retry)
                    this.stats.totalRequests++
                    const result = await this.executeWithRetry(requestFn)
                    this.stats.successfulRequests++
                    resolve(result)
                } catch (error) {
                    this.stats.failedRequests++
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
            // Wait for rate limit compliance
            await this.waitForRateLimit()

            const result = await requestFn()

            this.updateResponseTime(Date.now() - startTime)

            return result
        } catch (error: any) {
            // Check if it's a rate limit error
            if (this.isRateLimitError(error) && retryCount < this.config.maxRetries) {
                this.stats.rateLimitHits++
                this.stats.retriedRequests++

                // For rate limit errors, wait based on the configured rate
                // For 0.5 req/sec (30/min), wait at least 2 seconds, but increase with retries
                const baseDelay = Math.ceil(1000 / this.config.maxRequestsPerSecond)
                const delay = baseDelay * Math.pow(this.config.backoffMultiplier, retryCount)
                console.warn(`Rate limit hit, waiting ${delay}ms before retry (attempt ${retryCount + 1}/${this.config.maxRetries})`)

                await this.delay(delay)
                return this.executeWithRetry(requestFn, retryCount + 1)
            }

            // Check if it's a network error that should be retried
            if (this.isRetryableError(error) && retryCount < this.config.maxRetries) {
                this.stats.retriedRequests++

                // Use exponential backoff for network errors
                const delay = this.config.initialRetryDelay * Math.pow(this.config.backoffMultiplier, retryCount)
                console.warn(`Request failed, waiting ${delay}ms before retry (attempt ${retryCount + 1}/${this.config.maxRetries})`)

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

            // Execute the request function without awaiting it, but handle completion
            requestFn()
                .finally(() => {
                    this.activeRequests--
                    this.stats.currentQueueSize = this.requestQueue.length
                    // Continue processing queue after this request finishes
                    setTimeout(() => this.processQueue(), 0)
                })
        }

        this.processing = false
    }

    private async waitForRateLimit(): Promise<void> {
        const now = Date.now()
        
        // Calculate the time window based on the rate (in ms)
        // For 0.5 requests/second, window should be 2000ms (2 seconds)
        // For 1 request/second, window should be 1000ms (1 second)
        const windowMs = Math.ceil(1000 / this.config.maxRequestsPerSecond)
        const windowStart = now - windowMs

        // Remove old request times outside the current window
        this.requestTimes = this.requestTimes.filter(time => time > windowStart)

        // Calculate how many requests we can make in this window
        const maxRequestsInWindow = Math.ceil(this.config.maxRequestsPerSecond * (windowMs / 1000))

        // If we're at the limit, wait until the oldest request is outside the window
        if (this.requestTimes.length >= maxRequestsInWindow) {
            const oldestRequest = Math.min(...this.requestTimes)
            const waitTime = windowMs - (now - oldestRequest) + 100 // Add 100ms buffer
            if (waitTime > 0) {
                console.log(`Rate limit: waiting ${waitTime}ms (${this.requestTimes.length}/${maxRequestsInWindow} requests in ${windowMs}ms window)`)
                await this.delay(waitTime)
            }
        }

        this.requestTimes.push(now)
    }

    private isRateLimitError(error: any): boolean {
        // Check for HTTP 429 status
        if (error?.response?.status === 429 || error?.status === 429) {
            return true
        }
        
        // Check for AniList-specific rate limit messages
        const errorMessage = error?.message?.toLowerCase() || ''
        const responseText = error?.response?.data?.toString?.()?.toLowerCase() || ''
        const details = error?.details || []
        
        // Check error details from our proxy
        const hasRateLimitInDetails = details.some((detail: any) => 
            detail?.message?.toLowerCase?.()?.includes('rate limit') ||
            detail?.message?.toLowerCase?.()?.includes('too many requests')
        )
        
        return errorMessage.includes('rate limit') ||
            errorMessage.includes('too many requests') ||
            responseText.includes('rate limit') ||
            responseText.includes('too many requests') ||
            // AniList sometimes returns these
            errorMessage.includes('throttled') ||
            responseText.includes('throttled') ||
            hasRateLimitInDetails
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
        // Store response times for calculating average
        this.responseTimes.push(responseTime)

        // Calculate average from all response times
        const sum = this.responseTimes.reduce((acc: number, time: number) => acc + time, 0)
        this.stats.averageResponseTime = sum / this.responseTimes.length
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
        this.responseTimes = []
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

    // Debug method to check current rate limiting state
    getDebugInfo(): {
        windowMs: number,
        maxRequestsInWindow: number,
        currentRequests: number,
        oldestRequestAge: number
    } {
        const windowMs = Math.ceil(1000 / this.config.maxRequestsPerSecond)
        const maxRequestsInWindow = Math.ceil(this.config.maxRequestsPerSecond * (windowMs / 1000))
        const now = Date.now()
        const windowStart = now - windowMs
        const currentRequestsInWindow = this.requestTimes.filter(time => time > windowStart)
        
        return {
            windowMs,
            maxRequestsInWindow,
            currentRequests: currentRequestsInWindow.length,
            oldestRequestAge: currentRequestsInWindow.length > 0 ? now - Math.min(...currentRequestsInWindow) : 0
        }
    }
} 