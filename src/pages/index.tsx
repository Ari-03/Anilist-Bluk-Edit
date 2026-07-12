import type { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import Head from 'next/head'

import type { WorkspaceApplicationProps } from '@/components/WorkspaceApplication'
import { useApp } from '@/contexts/AppContext'

function StartupPlaceholder({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center" role="status">
      <p className="text-slate-600 dark:text-slate-300">{message}</p>
    </main>
  )
}

const Onboarding = dynamic(
  () =>
    import('@/components/accounts/Onboarding').then(
      (module) => module.Onboarding,
    ),
  {
    ssr: false,
    loading: () => <StartupPlaceholder message="Opening account controls…" />,
  },
)

const WorkspaceApplication = dynamic<WorkspaceApplicationProps>(
  () =>
    import('@/components/WorkspaceApplication').then(
      (module) => module.WorkspaceApplication,
    ),
  {
    ssr: false,
    loading: () => <StartupPlaceholder message="Opening your workspace…" />,
  },
)

export default function Home() {
  const { status, activeAccount, legacyCandidate } = useApp()
  const canOpenWorkspace =
    status === 'ready' &&
    activeAccount?.state === 'ready' &&
    legacyCandidate === null

  return (
    <>
      <Head>
        <title>AniList Bulk Edit · Update anime and manga lists</title>
        <meta
          name="description"
          content="An unofficial third-party tool for filtering and bulk editing one AniList account at a time."
        />
        <meta property="og:title" content="AniList Bulk Edit" />
        <meta property="og:description" content="Filter, review, and update AniList entries without a blocking reload." />
        <meta name="twitter:card" content="summary" />
      </Head>
      {status === 'booting' ? (
        <StartupPlaceholder message="Opening local account storage…" />
      ) : canOpenWorkspace && activeAccount ? (
        <WorkspaceApplication key={activeAccount.id} account={activeAccount} />
      ) : (
        <Onboarding />
      )}
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async () => ({ props: {} })
