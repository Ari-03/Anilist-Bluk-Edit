'use client'

import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Dialog, ProgressBar } from '@/components/ui'
import {
  hasAmbiguousResults,
  BulkChanges,
  BulkJobOutcome,
  BulkJobProgress,
  MediaListStatus,
} from '@/modules/bulk-edit'

export interface CustomListCatalogView {
  status: 'ready' | 'loading' | 'error'
  names: readonly string[]
  lastSyncedAt?: number
}

export interface BulkEditDialogProps {
  open: boolean
  initialMode?: 'edit' | 'delete'
  accountName: string
  selectedCount: number
  customListCatalog: CustomListCatalogView
  running?: boolean
  progress?: BulkJobProgress | null
  outcome?: BulkJobOutcome | null
  actionError?: string | null
  onSubmit: (changes: BulkChanges) => void
  onDelete: () => void
  onCancel: () => void
  onClose: () => void
  onRetryRemaining: () => void
  onRefreshCatalog: () => void
}

type EditableField =
  | 'status'
  | 'score'
  | 'progress'
  | 'private'
  | 'hiddenFromStatusLists'
  | 'notes'

type CustomListChange = 'keep' | 'add' | 'remove'

interface FormState {
  enabled: Record<EditableField, boolean>
  status: MediaListStatus
  score: string
  progress: string
  private: boolean
  hiddenFromStatusLists: boolean
  notes: string
  customLists: Record<string, CustomListChange>
}

const statusOptions: readonly { value: MediaListStatus; label: string }[] = [
  { value: 'CURRENT', label: 'Current' },
  { value: 'PLANNING', label: 'Planning' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'DROPPED', label: 'Dropped' },
  { value: 'REPEATING', label: 'Repeating' },
]

const createFormState = (names: readonly string[]): FormState => ({
  enabled: {
    status: false,
    score: false,
    progress: false,
    private: false,
    hiddenFromStatusLists: false,
    notes: false,
  },
  status: 'CURRENT',
  score: '0',
  progress: '0',
  private: true,
  hiddenFromStatusLists: true,
  notes: '',
  customLists: Object.fromEntries(names.map((name) => [name, 'keep'])),
})

const entryWord = (count: number) => (count === 1 ? 'entry' : 'entries')

function progressMessage(progress: BulkJobProgress): string {
  switch (progress.phase) {
    case 'preparing':
      return `Preparing ${progress.total} ${entryWord(progress.total)}.`
    case 'preflight':
      return `Checking current custom-list membership for ${progress.total} ${entryWord(progress.total)}.`
    case 'mutating':
      return `Updating entries: ${progress.confirmed} confirmed, ${progress.failed} failed, ${progress.unattempted} waiting.`
    case 'verifying':
      return `Verifying uncertain results: ${progress.confirmed} confirmed, ${progress.failed} failed.`
    case 'completed':
      return `Finished: ${progress.confirmed} confirmed and ${progress.failed} failed.`
  }
}

function outcomeMessage(outcome: BulkJobOutcome): string {
  const confirmed =
    outcome.confirmedPatches.length + outcome.confirmedDeletedIds.length
  const remaining = outcome.failures.length + outcome.unattemptedIds.length
  const confirmedText = `${confirmed} ${entryWord(confirmed)} confirmed.`

  if (outcome.status === 'completed') return confirmedText
  if (hasAmbiguousResults(outcome)) {
    return `${confirmedText} ${remaining} ${remaining === 1 ? 'result is' : 'results are'} still uncertain.`
  }

  return `${confirmedText} ${outcome.failures.length} failed and ${outcome.unattemptedIds.length} unattempted.`
}

function timestampLabel(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function fieldEdit<T>(enabled: boolean, value: T) {
  return enabled
    ? ({ kind: 'set', value } as const)
    : ({ kind: 'unchanged' } as const)
}

export function BulkEditDialog({
  open,
  initialMode = 'edit',
  accountName,
  selectedCount,
  customListCatalog,
  running = false,
  progress = null,
  outcome = null,
  actionError = null,
  onSubmit,
  onDelete,
  onCancel,
  onClose,
  onRetryRemaining,
  onRefreshCatalog,
}: BulkEditDialogProps) {
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const keepEntriesRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)
  const [frozenSelection, setFrozenSelection] = useState({
    accountName,
    selectedCount,
  })
  const [form, setForm] = useState<FormState>(() =>
    createFormState(customListCatalog.names),
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  useEffect(() => {
    if (open && !wasOpenRef.current && outcome === null) {
      setFrozenSelection({ accountName, selectedCount })
      setForm(createFormState(customListCatalog.names))
      setConfirmingDelete(initialMode === 'delete')
      setValidationMessage(null)
    }
    wasOpenRef.current = open
  }, [accountName, customListCatalog.names, initialMode, open, outcome, selectedCount])

  useEffect(() => {
    if (open && confirmingDelete && !running) keepEntriesRef.current?.focus()
  }, [confirmingDelete, open, running])

  const customListsAvailable = customListCatalog.status === 'ready'
  const customListChanges = useMemo(
    () =>
      Object.fromEntries(
        customListCatalog.names.map((name) => [
          name,
          customListsAvailable
            ? (form.customLists[name] ?? 'keep')
            : 'keep',
        ]),
      ) as Record<string, CustomListChange>,
    [customListCatalog.names, customListsAvailable, form.customLists],
  )

  const hasChanges =
    Object.values(form.enabled).some(Boolean) ||
    Object.values(customListChanges).some((change) => change !== 'keep')

  const updateEnabled = (field: EditableField, enabled: boolean) => {
    setValidationMessage(null)
    setForm((current) => ({
      ...current,
      enabled: { ...current.enabled, [field]: enabled },
    }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (outcome && hasAmbiguousResults(outcome)) return
    const score = Number(form.score)
    const progressValue = Number(form.progress)

    if (form.enabled.score && (form.score.trim() === '' || !Number.isFinite(score) || score < 0)) {
      setValidationMessage('Enter a score of zero or greater.')
      return
    }
    if (
      form.enabled.progress &&
      (form.progress.trim() === '' ||
        !Number.isSafeInteger(progressValue) ||
        progressValue < 0)
    ) {
      setValidationMessage('Enter a whole-number progress of zero or greater.')
      return
    }

    onSubmit({
      status: fieldEdit(form.enabled.status, form.status),
      score: fieldEdit(form.enabled.score, score),
      progress: fieldEdit(form.enabled.progress, progressValue),
      private: fieldEdit(form.enabled.private, form.private),
      hiddenFromStatusLists: fieldEdit(
        form.enabled.hiddenFromStatusLists,
        form.hiddenFromStatusLists,
      ),
      notes: fieldEdit(form.enabled.notes, form.notes),
      customLists: customListChanges,
    })
  }

  const ambiguousCount = outcome
    ? outcome.failures.filter((failure) => failure.kind === 'unknown').length
    : 0
  const retryCount = outcome
    ? outcome.failures.filter(
        (failure) => failure.kind !== 'unknown' && failure.retryable,
      ).length + outcome.unattemptedIds.length
    : 0
  const actionCount = ambiguousCount > 0 ? ambiguousCount : retryCount
  const ambiguous = outcome !== null && hasAmbiguousResults(outcome)
  const dismissalLocked = running || ambiguous
  const mayRetry =
    outcome !== null &&
    outcome.status !== 'completed' &&
    actionCount > 0 &&
    !running
  const activeSelection = outcome
    ? { accountName, selectedCount }
    : frozenSelection
  const title = confirmingDelete
    ? `Delete ${activeSelection.selectedCount} ${entryWord(activeSelection.selectedCount)} from ${activeSelection.accountName}?`
    : `Edit ${activeSelection.selectedCount} selected ${entryWord(activeSelection.selectedCount)}`

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !dismissalLocked) onClose()
      }}
      title={title}
      description={
        confirmingDelete
          ? 'This removes the selected list entries from AniList. It does not delete the media itself.'
          : `Changes will apply to ${activeSelection.accountName} only.`
      }
      initialFocusRef={ambiguous ? retryRef : confirmingDelete ? keepEntriesRef : firstFieldRef}
      closeOnBackdrop={!dismissalLocked}
      closeDisabled={dismissalLocked}
      closeLabel={
        running
          ? 'A bulk job is running; use cancel'
          : ambiguous
            ? 'Uncertain results require verification before closing'
            : 'Close bulk editor'
      }
      className="w-[min(46rem,calc(100vw-1rem))]"
    >
      {confirmingDelete ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            Confirm that you want to remove exactly{' '}
            <strong>
              {activeSelection.selectedCount}{' '}
              {entryWord(activeSelection.selectedCount)}
            </strong>{' '}
            from <strong>{activeSelection.accountName}</strong>.
          </div>

          {running ? <RunningJobStatus progress={progress} /> : null}
          {!running && outcome ? <OutcomeSummary outcome={outcome} /> : null}
          {actionError ? <DialogActionError message={actionError} /> : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            {running ? (
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancel bulk job
              </button>
            ) : (
              <>
                {mayRetry ? (
                  <button
                    ref={retryRef}
                    type="button"
                    className="btn-primary"
                    onClick={onRetryRemaining}
                  >
                    {ambiguousCount > 0 ? 'Verify' : 'Retry'}{' '}
                    {actionCount} {ambiguousCount > 0 ? 'uncertain' : 'remaining'}{' '}
                    {entryWord(actionCount)}
                  </button>
                ) : null}
                {!ambiguous ? (
                  <button
                    ref={keepEntriesRef}
                    type="button"
                    className="btn-secondary"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Keep entries
                  </button>
                ) : null}
                {!outcome ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-700 px-4 py-2 font-bold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:bg-red-600 dark:hover:bg-red-500 dark:focus-visible:ring-offset-slate-900"
                    onClick={onDelete}
                    disabled={activeSelection.selectedCount === 0}
                    aria-label={`Confirm deletion of ${activeSelection.selectedCount} ${entryWord(activeSelection.selectedCount)}`}
                  >
                    Delete {activeSelection.selectedCount} {entryWord(activeSelection.selectedCount)}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : (
        <form className="space-y-6" onSubmit={submit}>
          <fieldset
            disabled={running || ambiguous}
            className="space-y-4 disabled:opacity-70"
          >
            <legend className="text-base font-bold text-slate-950 dark:text-white">
              Entry fields
            </legend>

            <EditRow
              label="Status"
              checked={form.enabled.status}
              onCheckedChange={(checked) => updateEnabled('status', checked)}
              checkboxRef={firstFieldRef}
            >
              <select
                aria-label="Status value"
                className="field"
                disabled={!form.enabled.status || running}
                value={form.status}
                onChange={(event) => {
                  const status = event.currentTarget.value as MediaListStatus
                  setForm((current) => ({
                    ...current,
                    status,
                  }))
                }}
              >
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </EditRow>

            <EditRow
              label="Score"
              checked={form.enabled.score}
              onCheckedChange={(checked) => updateEnabled('score', checked)}
            >
              <input
                aria-label="Score value"
                className="field"
                type="number"
                min="0"
                step="0.1"
                required={form.enabled.score}
                disabled={!form.enabled.score || running}
                value={form.score}
                onChange={(event) => {
                  const score = event.currentTarget.value
                  setForm((current) => ({ ...current, score }))
                }}
              />
            </EditRow>

            <EditRow
              label="Progress"
              checked={form.enabled.progress}
              onCheckedChange={(checked) => updateEnabled('progress', checked)}
            >
              <input
                aria-label="Progress value"
                className="field"
                type="number"
                min="0"
                step="1"
                required={form.enabled.progress}
                disabled={!form.enabled.progress || running}
                value={form.progress}
                onChange={(event) => {
                  const progressValue = event.currentTarget.value
                  setForm((current) => ({
                    ...current,
                    progress: progressValue,
                  }))
                }}
              />
            </EditRow>

            <EditRow
              label="Privacy"
              checked={form.enabled.private}
              onCheckedChange={(checked) => updateEnabled('private', checked)}
            >
              <select
                aria-label="Privacy value"
                className="field"
                disabled={!form.enabled.private || running}
                value={String(form.private)}
                onChange={(event) => {
                  const privateValue = event.currentTarget.value === 'true'
                  setForm((current) => ({
                    ...current,
                    private: privateValue,
                  }))
                }}
              >
                <option value="true">Private</option>
                <option value="false">Public</option>
              </select>
            </EditRow>

            <EditRow
              label="Status-list visibility"
              checked={form.enabled.hiddenFromStatusLists}
              onCheckedChange={(checked) =>
                updateEnabled('hiddenFromStatusLists', checked)
              }
            >
              <select
                aria-label="Status-list visibility value"
                className="field"
                disabled={!form.enabled.hiddenFromStatusLists || running}
                value={String(form.hiddenFromStatusLists)}
                onChange={(event) => {
                  const hidden = event.currentTarget.value === 'true'
                  setForm((current) => ({
                    ...current,
                    hiddenFromStatusLists: hidden,
                  }))
                }}
              >
                <option value="true">Hide from status lists</option>
                <option value="false">Show in status lists</option>
              </select>
            </EditRow>

            <EditRow
              label="Notes"
              checked={form.enabled.notes}
              onCheckedChange={(checked) => updateEnabled('notes', checked)}
              stacked
            >
              <textarea
                aria-label="Notes value"
                className="field min-h-24 resize-y"
                disabled={!form.enabled.notes || running}
                value={form.notes}
                onChange={(event) => {
                  const notes = event.currentTarget.value
                  setForm((current) => ({ ...current, notes }))
                }}
                placeholder="Leave empty to clear notes"
              />
            </EditRow>
          </fieldset>

          <fieldset className="space-y-3" disabled={running || ambiguous}>
            <legend className="text-base font-bold text-slate-950 dark:text-white">
              Custom lists
            </legend>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {customListCatalog.lastSyncedAt === undefined
                    ? 'Not synced yet.'
                    : `Last synced ${timestampLabel(customListCatalog.lastSyncedAt)}.`}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={onRefreshCatalog}
                disabled={
                  running || ambiguous || customListCatalog.status === 'loading'
                }
              >
                {customListCatalog.status === 'loading'
                  ? 'Refreshing custom lists…'
                  : 'Refresh custom lists'}
              </button>
            </div>

            {customListCatalog.status === 'error' ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Custom-list controls are unavailable. Other entry fields can still be edited.
              </p>
            ) : null}

            {customListCatalog.names.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {customListCatalog.status === 'loading'
                  ? 'Loading custom lists…'
                  : 'No custom lists are available for this media type.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {customListCatalog.names.map((name) => (
                  <fieldset
                    key={name}
                    disabled={!customListsAvailable || running || ambiguous}
                    className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center disabled:opacity-60"
                  >
                    <legend className="min-w-0 break-words pr-2 text-sm font-semibold text-slate-900 sm:float-left dark:text-slate-100">
                      {name}
                    </legend>
                    <div
                      role="radiogroup"
                      aria-label={`${name} membership`}
                      className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
                    >
                      {(['keep', 'add', 'remove'] as const).map((change) => (
                        <label
                          key={change}
                          className="cursor-pointer rounded-md px-2 py-2 text-center text-xs font-semibold has-[:checked]:bg-white has-[:checked]:text-sky-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500 dark:has-[:checked]:bg-slate-700 dark:has-[:checked]:text-sky-300"
                        >
                          <input
                            className="sr-only"
                            type="radio"
                            name={`custom-list-${name}`}
                            value={change}
                            aria-label={`${change[0]?.toUpperCase()}${change.slice(1)} ${name}`}
                            checked={(form.customLists[name] ?? 'keep') === change}
                            onChange={() =>
                              setForm((current) => ({
                                ...current,
                                customLists: {
                                  ...current.customLists,
                                  [name]: change,
                                },
                              }))
                            }
                          />
                          {change[0]?.toUpperCase()}{change.slice(1)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
          </fieldset>

          {validationMessage ? (
            <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
              {validationMessage}
            </p>
          ) : null}
          {actionError ? <DialogActionError message={actionError} /> : null}
          {running ? <RunningJobStatus progress={progress} /> : null}
          {!running && outcome ? <OutcomeSummary outcome={outcome} /> : null}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            {running ? (
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancel bulk job
              </button>
            ) : (
              <>
                {!ambiguous ? (
                  <button type="button" className="btn-secondary" onClick={onClose}>
                    Close
                  </button>
                ) : null}
                {mayRetry ? (
                  <button
                    ref={retryRef}
                    type="button"
                    className="btn-primary"
                    onClick={onRetryRemaining}
                  >
                    {ambiguousCount > 0 ? 'Verify' : 'Retry'}{' '}
                    {actionCount} {ambiguousCount > 0 ? 'uncertain' : 'remaining'}{' '}
                    {entryWord(actionCount)}
                  </button>
                ) : null}
                {!outcome ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 font-bold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:text-red-300 dark:hover:bg-red-950/40 dark:focus-visible:ring-offset-slate-900"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={activeSelection.selectedCount === 0}
                  >
                    Delete {activeSelection.selectedCount} selected {entryWord(activeSelection.selectedCount)}
                  </button>
                ) : null}
                {!outcome ? (
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!hasChanges || activeSelection.selectedCount === 0}
                    aria-label={`Apply changes to ${activeSelection.selectedCount} ${entryWord(activeSelection.selectedCount)}`}
                  >
                    Apply changes
                  </button>
                ) : null}
              </>
            )}
          </div>
        </form>
      )}
    </Dialog>
  )
}

function DialogActionError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-100"
    >
      <p className="font-semibold">The requested action could not finish</p>
      <p className="mt-1">{message}</p>
    </div>
  )
}

interface EditRowProps {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
  checkboxRef?: RefObject<HTMLInputElement | null>
  stacked?: boolean
}

function EditRow({
  label,
  checked,
  onCheckedChange,
  children,
  checkboxRef,
  stacked = false,
}: EditRowProps) {
  return (
    <div
      className={`grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 ${
        stacked ? '' : 'sm:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1.25fr)] sm:items-center'
      }`}
    >
      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold text-slate-900 dark:text-slate-100">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.currentTarget.checked)}
          aria-label={`Change ${label.toLowerCase()}`}
          className="size-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
        />
        Change {label.toLowerCase()}
      </label>
      {children}
    </div>
  )
}

function JobProgress({ progress }: { progress: BulkJobProgress }) {
  return (
    <section aria-label="Bulk job status" className="rounded-xl bg-sky-50 p-4 dark:bg-sky-950/30">
      <ProgressBar
        label="Bulk edit progress"
        value={progress.attempted}
        max={Math.max(1, progress.total)}
        valueText={`${progress.attempted} of ${progress.total} attempted`}
      />
      <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm text-slate-700 dark:text-slate-200">
        {progressMessage(progress)}
      </p>
    </section>
  )
}

function RunningJobStatus({ progress }: { progress: BulkJobProgress | null }) {
  if (progress) return <JobProgress progress={progress} />
  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-xl bg-sky-50 p-4 text-sm font-semibold text-slate-700 dark:bg-sky-950/30 dark:text-slate-200"
    >
      Starting the bulk job…
    </p>
  )
}

function OutcomeSummary({ outcome }: { outcome: BulkJobOutcome }) {
  const uncertain = hasAmbiguousResults(outcome)
  return (
    <section
      className={`rounded-xl p-4 ${
        outcome.status === 'completed'
          ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
          : 'bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
      }`}
      aria-label="Bulk job outcome"
    >
      <p role="status" aria-live="polite" aria-atomic="true" className="font-semibold">
        {outcomeMessage(outcome)}
      </p>
      {uncertain ? (
        <p className="mt-1 text-sm">
          Verify uncertain entries before retrying so an ambiguous mutation is not repeated blindly.
        </p>
      ) : null}
    </section>
  )
}
