import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { ArrowLeft, Github, Home } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title>Page not found · AniList Bulk Edit</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <section className="panel w-full max-w-lg p-8 text-center" aria-labelledby="not-found-title">
          <p className="mb-2 text-7xl font-black text-sky-500" aria-hidden="true">404</p>
          <h1 id="not-found-title" className="text-2xl font-bold">Page not found</h1>
          <p className="mx-auto mt-3 max-w-sm text-slate-600 dark:text-slate-300">
            This address does not point to a page in AniList Bulk Edit.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/" className="btn-primary">
              <Home className="h-4 w-4" aria-hidden="true" /> Home
            </Link>
            <a
              href="https://github.com/Ari-03/Anilist-Bluk-Edit/issues"
              className="btn-secondary"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="h-4 w-4" aria-hidden="true" /> Report a problem
            </a>
          </div>
          <button className="mt-5 text-sm text-slate-500 underline" onClick={() => history.back()}>
            <ArrowLeft className="mr-1 inline h-4 w-4" aria-hidden="true" /> Go back
          </button>
        </section>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.statusCode = 404
  return { props: {} }
}
