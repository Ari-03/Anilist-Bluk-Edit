import { NextPageContext } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { 
  AlertTriangle, 
  RefreshCw, 
  Home, 
  Bug, 
  ChevronDown, 
  ChevronUp,
  Copy,
  CheckCircle
} from 'lucide-react'

interface ErrorProps {
  statusCode?: number
  hasGetInitialPropsRun?: boolean
  err?: Error & { digest?: string }
  title?: string
}

function Error({ statusCode, hasGetInitialPropsRun, err, title }: ErrorProps) {
  const router = useRouter()
  const [showDetails, setShowDetails] = useState(false)
  const [copied, setCopied] = useState(false)

  // Determine error type and messages
  const getErrorInfo = () => {
    if (statusCode === 404) {
      return {
        title: 'Page Not Found',
        message: 'The page you\'re looking for doesn\'t exist or has been moved.',
        icon: '🔍',
        color: 'blue'
      }
    }
    
    if (statusCode === 500) {
      return {
        title: 'Internal Server Error',
        message: 'Something went wrong on our end. We\'re working to fix this issue.',
        icon: '⚙️',
        color: 'red'
      }
    }
    
    if (statusCode === 429) {
      return {
        title: 'Too Many Requests',
        message: 'You\'re making requests too quickly. Please wait a moment and try again.',
        icon: '⏱️',
        color: 'orange'
      }
    }
    
    if (statusCode === 403) {
      return {
        title: 'Access Forbidden',
        message: 'You don\'t have permission to access this resource.',
        icon: '🔒',
        color: 'red'
      }
    }
    
    if (statusCode === 401) {
      return {
        title: 'Authentication Required',
        message: 'Please sign in to access this page.',
        icon: '🔑',
        color: 'yellow'
      }
    }
    
    if (statusCode && statusCode >= 400) {
      return {
        title: `Error ${statusCode}`,
        message: 'An error occurred while processing your request.',
        icon: '❌',
        color: 'red'
      }
    }
    
    // Client-side error
    return {
      title: 'Something Went Wrong',
      message: 'An unexpected error occurred. Please try refreshing the page.',
      icon: '💥',
      color: 'red'
    }
  }

  const errorInfo = getErrorInfo()
  
  const copyErrorDetails = async () => {
    const details = {
      timestamp: new Date().toISOString(),
      statusCode,
      url: typeof window !== 'undefined' ? window.location.href : 'Unknown',
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'Unknown',
      error: err?.message || 'Unknown error',
      stack: err?.stack || 'No stack trace available',
      digest: err?.digest
    }
    
    try {
      await navigator.clipboard.writeText(JSON.stringify(details, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy error details:', error)
    }
  }

  const handleRefresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          text: 'text-blue-900 dark:text-blue-200',
          button: 'bg-blue-600 hover:bg-blue-700'
        }
      case 'orange':
        return {
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-200 dark:border-orange-800',
          text: 'text-orange-900 dark:text-orange-200',
          button: 'bg-orange-600 hover:bg-orange-700'
        }
      case 'yellow':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          text: 'text-yellow-900 dark:text-yellow-200',
          button: 'bg-yellow-600 hover:bg-yellow-700'
        }
      default:
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          text: 'text-red-900 dark:text-red-200',
          button: 'bg-red-600 hover:bg-red-700'
        }
    }
  }

  const colors = getColorClasses(errorInfo.color)

  return (
    <>
      <Head>
        <title>{`${errorInfo.title} | AniList Bulk Edit`}</title>
        <meta name="description" content={errorInfo.message} />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            {/* Error Icon and Code */}
            <div className="mb-6">
              <div className="text-6xl mb-4">{errorInfo.icon}</div>
              {statusCode && (
                <div className="text-4xl font-bold text-gray-400 dark:text-gray-500 mb-2">
                  {statusCode}
                </div>
              )}
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {title || errorInfo.title}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {errorInfo.message}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <button
                onClick={handleRefresh}
                className={`${colors.button} text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2`}
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              
              <Link href="/">
                <button className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Home className="w-4 h-4" />
                  Go Home
                </button>
              </Link>
            </div>

            {/* Error Details (Collapsible) */}
            {(err || statusCode) && (
              <div className={`${colors.bg} ${colors.border} border rounded-lg p-4 text-left`}>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className={`${colors.text} font-medium text-sm flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity`}
                >
                  <Bug className="w-4 h-4" />
                  Technical Details
                  {showDetails ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                
                {showDetails && (
                  <div className="space-y-3">
                    <div className="bg-white dark:bg-gray-900 rounded p-3 font-mono text-xs">
                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Timestamp:</span>
                          <span className="ml-2">{new Date().toISOString()}</span>
                        </div>
                        {statusCode && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Status Code:</span>
                            <span className="ml-2">{statusCode}</span>
                          </div>
                        )}
                        {typeof window !== 'undefined' && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">URL:</span>
                            <span className="ml-2 break-all">{window.location.href}</span>
                          </div>
                        )}
                        {err?.message && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Error:</span>
                            <span className="ml-2">{err.message}</span>
                          </div>
                        )}
                        {err?.digest && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Digest:</span>
                            <span className="ml-2">{err.digest}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={copyErrorDetails}
                      className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                    >
                      {copied ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      {copied ? 'Copied!' : 'Copy Error Details'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Additional Help */}
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              <p>
                If this problem persists, please{' '}
                <a 
                  href="https://github.com/anthropics/claude-code/issues" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  report the issue
                </a>
                {' '}with the technical details above.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error