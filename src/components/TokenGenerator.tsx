import React, { useState, useEffect } from 'react'
import { ExternalLink, Copy, CheckCircle, AlertCircle, Info } from 'lucide-react'

interface TokenGeneratorProps {
  onTokenGenerated?: (token: string) => void
}

const TokenGenerator: React.FC<TokenGeneratorProps> = ({ onTokenGenerated }) => {
  const [clientId, setClientId] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  // Generate a random client ID placeholder for demo
  const demoClientId = '12345'

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  const generateTokenUrl = (clientId: string) => {
    return `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&response_type=token`
  }

  return (
    <div className="space-y-6">
      {/* Getting Started Instructions */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-3 flex items-center">
          <Info className="h-5 w-5 mr-2" />
          How to Generate Your Token
        </h3>
        <div className="text-sm text-blue-800 dark:text-blue-300 space-y-3">
          <p className="font-medium">To use this application, you need to create your own AniList OAuth application:</p>
          <ol className="list-decimal list-inside space-y-2 ml-4">
            <li>Go to <a href="https://anilist.co/settings/developer" target="_blank" rel="noopener noreferrer" className="underline font-medium">AniList Developer Settings</a></li>
            <li>Click <strong>"Create New Client"</strong></li>
            <li>Fill in the application details:
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li><strong>Name:</strong> Your app name (e.g., "My AniList Bulk Editor")</li>
                <li><strong>Redirect URL:</strong> <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">https://example.com/callback</code></li>
              </ul>
            </li>
            <li>Copy your <strong>Client ID</strong> and enter it below</li>
            <li>Click the "Generate Token" button that appears</li>
            <li>Authorize the application and copy the access token from the URL</li>
          </ol>
        </div>
      </div>

      {/* Client ID Input */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div>
          <label htmlFor="client-id" className="block text-sm font-medium text-gray-900 dark:text-gray-200 mb-2">
            Your AniList Client ID
          </label>
          <input
            id="client-id"
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={`Enter your Client ID (e.g., ${demoClientId})`}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        {clientId && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-200 mb-2">
              Generate Access Token
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => window.open(generateTokenUrl(clientId), '_blank')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Generate Token
              </button>
              <button
                onClick={() => copyToClipboard(generateTokenUrl(clientId), 'token-url')}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Copy URL"
              >
                {copied === 'token-url' ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Click → Authorize → Copy token from URL (after "access_token=")
            </p>
          </div>
        )}
      </div>

      {/* Security Notice */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <p className="font-medium">Security Note:</p>
            <p>Tokens provide full access to your AniList account. Keep them secure and don't share them. Tokens are valid for 1 year.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TokenGenerator