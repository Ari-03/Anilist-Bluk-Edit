import type { NextPageContext } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { Github, Home, RefreshCw } from 'lucide-react'

interface ErrorPageProps {
  statusCode?: number
}

export default function ErrorPage({ statusCode }: ErrorPageProps) {
  const title = statusCode ? `Error ${statusCode}` : 'Something went wrong'

  return (
    <>
      <Head>
        <title>{title} · AniList Bulk Edit</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <section className="panel w-full max-w-lg p-8 text-center" aria-labelledby="error-title">
          <p className="subtle-label">AniList Bulk Edit</p>
          <h1 id="error-title" className="mt-2 text-2xl font-bold">{title}</h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300">
            This page hit a problem. If an edit was in progress, check its result
            in AniList before retrying so an uncertain mutation is not repeated.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button className="btn-primary" onClick={() => location.reload()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
            <Link href="/" className="btn-secondary">
              <Home className="h-4 w-4" aria-hidden="true" /> Home
            </Link>
          </div>
          <a
            className="mt-5 inline-flex items-center gap-2 text-sm text-sky-700 underline dark:text-sky-300"
            href="https://github.com/Ari-03/Anilist-Bluk-Edit/issues"
            target="_blank"
            rel="noreferrer"
          >
            <Github className="h-4 w-4" aria-hidden="true" /> Report a problem
          </a>
        </section>
      </main>
    </>
  )
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext): ErrorPageProps => ({
  statusCode: res?.statusCode ?? err?.statusCode,
})
