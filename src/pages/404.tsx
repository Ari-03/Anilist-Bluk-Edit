import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Home, Search, ArrowLeft } from 'lucide-react'

export default function Custom404() {
  const router = useRouter()

  return (
    <>
      <Head>
        <title>Page Not Found | AniList Bulk Edit</title>
        <meta name="description" content="The page you're looking for doesn't exist or has been moved." />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
            {/* 404 Animation */}
            <div className="mb-8">
              <div className="text-8xl font-bold text-blue-500 dark:text-blue-400 mb-4">
                404
              </div>
              <div className="text-4xl mb-4">🔍</div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Page Not Found
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                The page you're looking for doesn't exist or has been moved.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Link href="/">
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Home className="w-4 h-4" />
                  Go to Home
                </button>
              </Link>
              
              <button
                onClick={() => router.back()}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </button>
            </div>

            {/* Additional Help */}
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              <p>
                If you believe this is an error, please{' '}
                <a 
                  href="https://github.com/anthropics/claude-code/issues" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  report the issue
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}