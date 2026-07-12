import { useEffect, useRef, useState } from 'react'
import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { CheckCircle, LoaderCircle, XCircle } from 'lucide-react'

import { useApp } from '@/contexts/AppContext'
import { captureAndClearOAuthFragment } from '@/modules/accounts'

let capturedFragment =
  typeof window === 'undefined'
    ? ''
    : captureAndClearOAuthFragment(window.location, window.history)

export default function AuthCallback() {
  const fragmentRef = useRef(capturedFragment)
  const router = useRouter()
  const { status: appStatus, startupError, completeLink } = useApp()
  const started = useRef(false)
  const [state, setState] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('Validating this AniList account…')
  const immediateError =
    appStatus === 'error'
      ? (startupError ?? 'Local account storage could not be opened.')
      : null
  const renderedState = immediateError ? 'error' : state
  const renderedMessage = immediateError ?? message

  useEffect(() => {
    if (started.current || appStatus === 'booting') return
    started.current = true

    const fragment = fragmentRef.current
    capturedFragment = ''
    fragmentRef.current = ''
    if (appStatus === 'error') return
    if (!fragment) {
      setState('error')
      setMessage('The AniList callback did not include authorization details.')
      return
    }
    void completeLink(fragment)
      .then(() => {
        setState('success')
        setMessage('Account linked. Returning to your list…')
        return router.replace('/')
      })
      .catch((error: unknown) => {
        setState('error')
        setMessage(error instanceof Error ? error.message : 'AniList authorization failed.')
      })
  }, [appStatus, completeLink, router, startupError])

  return (
    <>
      <Head>
        <title>Linking account · AniList Bulk Edit</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <section className="panel w-full max-w-md p-8 text-center" aria-live="polite">
          {renderedState === 'processing' ? (
            <LoaderCircle className="mx-auto h-12 w-12 animate-spin text-sky-500 motion-reduce:animate-none" aria-hidden="true" />
          ) : renderedState === 'success' ? (
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-600" aria-hidden="true" />
          ) : (
            <XCircle className="mx-auto h-12 w-12 text-red-600" aria-hidden="true" />
          )}
          <h1 className="mt-5 text-xl font-bold">
            {renderedState === 'error' ? 'Could not link account' : 'Linking AniList account'}
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{renderedMessage}</p>
          {renderedState === 'error' ? (
            <button className="btn-primary mt-6 w-full" onClick={() => void router.replace('/')}>
              Return to AniList Bulk Edit
            </button>
          ) : null}
        </section>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async () => ({ props: {} })
