'use client'

import { type RefObject, useId, useMemo, useRef } from 'react'

import { Dialog, ProgressBar } from '@/components/ui'
import type {
  FuzzyDate,
  MediaId,
  MediaListStatus,
  RelatedMediaConnection,
  RelatedSeasonDiscovery,
  RelatedSeasonPreviewNode,
} from '@/modules/anilist'
import {
  hasAmbiguousResults,
  type BulkJobOutcome,
  type BulkJobProgress,
} from '@/modules/bulk-edit'

export interface RelatedSeasonsDialogProps {
  open: boolean
  accountName: string
  seedTitle: string
  loading: boolean
  error: string | null
  discovery: RelatedSeasonDiscovery | null
  selectedMediaIds: ReadonlySet<MediaId>
  running?: boolean
  progress?: BulkJobProgress | null
  outcome?: BulkJobOutcome | null
  actionError?: string | null
  onToggle: (mediaId: MediaId) => void
  onConfirm: (mediaIds: readonly MediaId[]) => void
  onCancel: () => void
  onClose: () => void
  onRetry: () => void
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  count === 1 ? singular : pluralForm

const displayTitle = (node: Pick<RelatedSeasonPreviewNode, 'title'>): string =>
  node.title.userPreferred ??
  node.title.english ??
  node.title.romaji ??
  node.title.native ??
  'Untitled media'

const formatName = (format: string | null | undefined): string =>
  format?.replaceAll('_', ' ') ?? 'Unknown format'

const statusName = (status: MediaListStatus | undefined): string | null => {
  if (!status) return null
  const names: Record<MediaListStatus, string> = {
    CURRENT: 'Current',
    PLANNING: 'Planning',
    COMPLETED: 'Completed',
    DROPPED: 'Dropped',
    PAUSED: 'Paused',
    REPEATING: 'Repeating',
  }
  return names[status]
}

interface FormattedDate {
  dateTime: string
  label: string
}

function formatReleaseDate(
  releaseDate: FuzzyDate | null | undefined,
  seasonYear: number | null | undefined,
): FormattedDate | null {
  const year = releaseDate?.year ?? seasonYear
  if (typeof year !== 'number') return null

  const month = releaseDate?.month
  const day = releaseDate?.day
  if (typeof month !== 'number' || month < 1 || month > 12) {
    return { dateTime: `${year}`, label: `${year}` }
  }

  const date = new Date(Date.UTC(year, month - 1, typeof day === 'number' ? day : 1))
  if (typeof day !== 'number' || day < 1 || day > 31) {
    return {
      dateTime: `${year}-${String(month).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat(undefined, {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date),
    }
  }

  return {
    dateTime: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    label: new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date),
  }
}

function relationName(relation: RelatedMediaConnection): string | null {
  if (relation.relationType === 'PREQUEL') return 'Prequel'
  if (relation.relationType === 'SEQUEL') return 'Sequel'
  return null
}

function progressMessage(progress: BulkJobProgress): string {
  const relatedSeasons = `${progress.total} ${plural(progress.total, 'related season')}`
  switch (progress.phase) {
    case 'preparing':
      return `Preparing ${relatedSeasons}.`
    case 'preflight':
      return `Checking the current list state for ${relatedSeasons}.`
    case 'mutating':
      return `Updating related seasons: ${progress.confirmed} confirmed and ${progress.unattempted} waiting.`
    case 'verifying':
      return `Verifying uncertain results: ${progress.confirmed} confirmed and ${progress.failed} failed.`
    case 'completed':
      return `Finished: ${progress.confirmed} confirmed and ${progress.failed} failed.`
  }
}

function outcomeCounts(outcome: BulkJobOutcome) {
  return {
    confirmed:
      outcome.confirmedPatches.length +
      outcome.confirmedDeletedIds.length +
      (outcome.confirmedCreatedEntries?.length ?? 0),
    remaining:
      outcome.failures.length +
      (outcome.creationFailures?.length ?? 0) +
      outcome.unattemptedIds.length +
      (outcome.unattemptedMediaIds?.length ?? 0),
  }
}

function outcomeMessage(outcome: BulkJobOutcome): string {
  const { confirmed, remaining } = outcomeCounts(outcome)
  const confirmedText = `${confirmed} ${plural(confirmed, 'related season')} confirmed.`

  if (outcome.status === 'completed') return confirmedText
  if (hasAmbiguousResults(outcome)) {
    return `${confirmedText} ${remaining} ${plural(remaining, 'result')} ${
      remaining === 1 ? 'is' : 'are'
    } uncertain.`
  }
  return `${confirmedText} ${remaining} ${remaining === 1 ? 'remains' : 'remain'}.`
}

export function RelatedSeasonsDialog({
  open,
  accountName,
  seedTitle,
  loading,
  error,
  discovery,
  selectedMediaIds,
  running = false,
  progress = null,
  outcome = null,
  actionError = null,
  onToggle,
  onConfirm,
  onCancel,
  onClose,
  onRetry,
}: RelatedSeasonsDialogProps) {
  const firstCheckboxRef = useRef<HTMLInputElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const selectedIds = useMemo(
    () =>
      discovery?.nodes
        .filter((node) => selectedMediaIds.has(node.id))
        .map((node) => node.id) ?? [],
    [discovery, selectedMediaIds],
  )
  const selectedCount = selectedIds.length
  const hasPreview = discovery !== null && discovery.nodes.length > 0
  const hasAmbiguousOutcome = outcome !== null && hasAmbiguousResults(outcome)
  const dismissalLocked = running || hasAmbiguousOutcome
  const initialFocusRef = running
    ? cancelRef
    : error || (outcome && outcome.status !== 'completed')
      ? retryRef
      : hasPreview
        ? firstCheckboxRef
        : closeRef

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !dismissalLocked) onClose()
      }}
      title="Find related seasons"
      description={`Review prequels and sequels related to ${seedTitle} for ${accountName}.`}
      initialFocusRef={initialFocusRef}
      closeOnBackdrop={!dismissalLocked}
      closeDisabled={dismissalLocked}
      closeLabel={
        running
          ? 'A related-season job is running; use cancel'
          : hasAmbiguousOutcome
            ? 'Uncertain results require verification before closing'
            : 'Close related-season preview'
      }
      className="w-[min(52rem,calc(100vw-2rem))]"
    >
      <div className="space-y-5">
        {loading ? <LoadingState seedTitle={seedTitle} /> : null}
        {!loading && error ? <ErrorState message={error} /> : null}
        {!loading && !error && discovery ? (
          <DiscoveryPreview
            discovery={discovery}
            selectedMediaIds={selectedMediaIds}
            selectionLocked={running || outcome !== null}
            firstCheckboxRef={firstCheckboxRef}
            onToggle={onToggle}
          />
        ) : null}
        {!loading && !error && !discovery ? (
          <p role="status" className="rounded-xl bg-slate-100 p-4 text-sm dark:bg-slate-800">
            No related-season preview is available yet.
          </p>
        ) : null}

        {running ? <RunningState progress={progress} /> : null}
        {!running && outcome ? <OutcomeState outcome={outcome} /> : null}
        {actionError ? <ActionErrorState message={actionError} /> : null}

        {!loading && !error && hasPreview && !running && !outcome ? (
          <section
            aria-label="Confirmation summary"
            className="rounded-xl bg-sky-50 p-4 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100"
          >
            <p className="font-semibold">
              Exactly {selectedCount} {plural(selectedCount, 'related season')} will be
              changed in {accountName}.
            </p>
            <p className="mt-1 text-sm">
              Start and completion dates will not be set automatically.
            </p>
          </section>
        ) : null}

        <DialogActions
          loading={loading}
          error={error}
          hasPreview={hasPreview}
          running={running}
          outcome={outcome}
          selectedIds={selectedIds}
          accountName={accountName}
          retryRef={retryRef}
          cancelRef={cancelRef}
          closeRef={closeRef}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onClose={onClose}
          onRetry={onRetry}
        />
      </div>
    </Dialog>
  )
}

function ActionErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl bg-red-50 p-4 text-red-900 dark:bg-red-950/30 dark:text-red-100"
    >
      <p className="font-semibold">The related-season action could not finish</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  )
}

function LoadingState({ seedTitle }: { seedTitle: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-xl bg-sky-50 p-4 font-semibold text-sky-950 dark:bg-sky-950/30 dark:text-sky-100"
    >
      Finding prequels and sequels for {seedTitle}…
    </p>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl bg-red-50 p-4 text-red-900 dark:bg-red-950/30 dark:text-red-100"
    >
      <p className="font-semibold">Related-season search failed</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  )
}

interface DiscoveryPreviewProps {
  discovery: RelatedSeasonDiscovery
  selectedMediaIds: ReadonlySet<MediaId>
  selectionLocked: boolean
  firstCheckboxRef: RefObject<HTMLInputElement | null>
  onToggle: (mediaId: MediaId) => void
}

function DiscoveryPreview({
  discovery,
  selectedMediaIds,
  selectionLocked,
  firstCheckboxRef,
  onToggle,
}: DiscoveryPreviewProps) {
  if (discovery.nodes.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 p-5 text-center dark:border-slate-700">
        <h3 className="font-semibold">No related seasons found</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          No same-type prequels or sequels were found for this title.
        </p>
      </section>
    )
  }

  const titles = new Map<MediaId, string>([
    [discovery.seed.id, displayTitle({ title: discovery.seed.title })],
    ...discovery.nodes.map((node) => [node.id, displayTitle(node)] as const),
  ])

  return (
    <section aria-labelledby="related-preview-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="related-preview-heading" className="font-semibold">
            Related-season preview
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {discovery.nodes.length}{' '}
            {plural(discovery.nodes.length, 'same-type season')} found.
          </p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Missing titles start selected; existing entries do not.
        </p>
      </div>

      <ol className="mt-3 space-y-3" aria-label="Related seasons">
        {discovery.nodes.map((node, index) => (
          <RelatedSeasonItem
            key={node.id}
            node={node}
            title={displayTitle(node)}
            checked={selectedMediaIds.has(node.id)}
            disabled={selectionLocked}
            titles={titles}
            checkboxRef={index === 0 ? firstCheckboxRef : undefined}
            onToggle={() => onToggle(node.id)}
          />
        ))}
      </ol>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Cycles and duplicate paths are collapsed into one preview item.
      </p>
      {discovery.truncated ? (
        <p
          role="note"
          className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
        >
          Search stopped after visiting {discovery.visitedCount} media to keep the
          preview bounded. Some related seasons may be missing.
        </p>
      ) : null}
    </section>
  )
}

interface RelatedSeasonItemProps {
  node: RelatedSeasonPreviewNode
  title: string
  checked: boolean
  disabled: boolean
  titles: ReadonlyMap<MediaId, string>
  checkboxRef?: RefObject<HTMLInputElement | null>
  onToggle: () => void
}

function RelatedSeasonItem({
  node,
  title,
  checked,
  disabled,
  titles,
  checkboxRef,
  onToggle,
}: RelatedSeasonItemProps) {
  const checkboxId = useId()
  const existing = node.existingListEntry !== null
  const release = formatReleaseDate(node.releaseDate, node.seasonYear)
  const status = statusName(node.existingListEntry?.status)
  const selectionLabel = existing ? `Update existing ${title}` : `Include ${title}`
  const knownProgress = node.proposedAction.progress
  const relationCues = node.connections.flatMap((connection) => {
    const relation = relationName(connection)
    if (!relation) return []
    return [{ relation, target: titles.get(connection.mediaId) ?? 'another related title' }]
  })

  return (
    <li
      aria-label={title}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      style={{ marginInlineStart: `${Math.min(Math.max(node.depth - 1, 0), 3) * 0.75}rem` }}
    >
      <div className="flex items-start gap-3">
        <input
          ref={checkboxRef}
          id={checkboxId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={selectionLabel}
          onChange={onToggle}
          className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h4 className="font-semibold text-slate-950 dark:text-white">
              <label htmlFor={checkboxId} className="cursor-pointer">
                {title}
              </label>
            </h4>
            <span className="subtle-label">{formatName(node.format)}</span>
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {node.depth} {plural(node.depth, 'connection')} from the seed
            </span>
            {release ? (
              <time dateTime={release.dateTime}>{release.label}</time>
            ) : (
              <span>Release date unknown</span>
            )}
          </div>

          {relationCues.length > 0 ? (
            <ul
              aria-label={`Connections for ${title}`}
              className="mt-2 flex flex-wrap gap-2 text-xs"
            >
              {relationCues.map((cue, index) => (
                <li
                  key={`${cue.relation}-${cue.target}-${index}`}
                  className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {cue.relation}: {cue.target}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">
            {existing
              ? `Already on your list${status ? ` as ${status}` : ''}. ${checked ? 'This entry will be updated.' : 'No change.'}`
              : checked
                ? 'Not on your list. This title will be added.'
                : 'Not on your list. No change.'}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {checked
              ? `${existing ? 'Update to' : 'Add as'} Completed${
                  typeof knownProgress === 'number'
                    ? ` with progress ${knownProgress}.`
                    : '. Progress will remain unspecified.'
                }`
              : `Proposed action: Completed. ${
                  typeof knownProgress === 'number'
                    ? `Known progress is ${knownProgress}.`
                    : 'Progress will remain unspecified.'
                }`}
          </p>
        </div>
      </div>
    </li>
  )
}

function RunningState({ progress }: { progress: BulkJobProgress | null }) {
  if (!progress) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="rounded-xl bg-sky-50 p-4 font-semibold text-sky-950 dark:bg-sky-950/30 dark:text-sky-100"
      >
        Starting the related-season job…
      </p>
    )
  }

  return (
    <section
      aria-label="Related-season job status"
      className="rounded-xl bg-sky-50 p-4 dark:bg-sky-950/30"
    >
      <ProgressBar
        label="Related-season update progress"
        value={progress.attempted}
        max={Math.max(1, progress.total)}
        valueText={`${progress.attempted} of ${progress.total} attempted`}
      />
      <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm">
        {progressMessage(progress)}
      </p>
    </section>
  )
}

function OutcomeState({ outcome }: { outcome: BulkJobOutcome }) {
  const uncertain = hasAmbiguousResults(outcome)
  return (
    <section
      aria-label="Related-season job outcome"
      className={`rounded-xl p-4 ${
        outcome.status === 'completed'
          ? 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100'
          : 'bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
      }`}
    >
      <p role="status" aria-live="polite" aria-atomic="true" className="font-semibold">
        {outcomeMessage(outcome)}
      </p>
      {uncertain ? (
        <p className="mt-1 text-sm">
          Verify uncertain results before retrying so an ambiguous mutation is not
          repeated blindly.
        </p>
      ) : null}
    </section>
  )
}

interface DialogActionsProps {
  loading: boolean
  error: string | null
  hasPreview: boolean
  running: boolean
  outcome: BulkJobOutcome | null
  selectedIds: readonly MediaId[]
  accountName: string
  retryRef: RefObject<HTMLButtonElement | null>
  cancelRef: RefObject<HTMLButtonElement | null>
  closeRef: RefObject<HTMLButtonElement | null>
  onConfirm: (mediaIds: readonly MediaId[]) => void
  onCancel: () => void
  onClose: () => void
  onRetry: () => void
}

function DialogActions({
  loading,
  error,
  hasPreview,
  running,
  outcome,
  selectedIds,
  accountName,
  retryRef,
  cancelRef,
  closeRef,
  onConfirm,
  onCancel,
  onClose,
  onRetry,
}: DialogActionsProps) {
  const ambiguous = outcome
    ? outcome.failures.filter((failure) => failure.kind === 'unknown').length +
      (outcome.creationFailures ?? []).filter(
        (failure) => failure.kind === 'unknown',
      ).length
    : 0
  const retryable = outcome
    ? outcome.failures.filter(
        (failure) => failure.kind !== 'unknown' && failure.retryable,
      ).length +
      (outcome.creationFailures ?? []).filter(
        (failure) => failure.kind !== 'unknown' && failure.retryable,
      ).length +
      outcome.unattemptedIds.length +
      (outcome.unattemptedMediaIds?.length ?? 0)
    : 0
  const actionCount = ambiguous > 0 ? ambiguous : retryable

  return (
    <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
      {running ? (
        <button ref={cancelRef} type="button" className="btn-secondary" onClick={onCancel}>
          Cancel related-season job
        </button>
      ) : (
        <>
          {ambiguous === 0 ? (
            <button
              ref={closeRef}
              type="button"
              className="btn-secondary"
              onClick={onClose}
            >
              Close preview
            </button>
          ) : null}
          {error ? (
            <button ref={retryRef} type="button" className="btn-primary" onClick={onRetry}>
              Retry related-season search
            </button>
          ) : null}
          {!error && outcome && outcome.status !== 'completed' && actionCount > 0 ? (
            <button ref={retryRef} type="button" className="btn-primary" onClick={onRetry}>
              {ambiguous > 0 ? 'Verify' : 'Retry'} {actionCount}{' '}
              {ambiguous > 0 ? 'uncertain' : 'remaining'}{' '}
              {plural(actionCount, 'related season')}
            </button>
          ) : null}
          {!loading && !error && !outcome && hasPreview ? (
            <button
              type="button"
              className="btn-primary"
              disabled={selectedIds.length === 0}
              onClick={() => onConfirm(selectedIds)}
              aria-label={`Confirm ${selectedIds.length} ${plural(
                selectedIds.length,
                'related season',
              )} for ${accountName}`}
            >
              Confirm {selectedIds.length}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
