import { useEffect, useId, useRef, type RefObject } from 'react'
import { X } from 'lucide-react'

import { FilterRail, type FilterRailProps } from './FilterRail'

export interface FilterDrawerProps extends Omit<
  FilterRailProps,
  'className' | 'searchAutoFocus' | 'title'
> {
  open: boolean
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}

export function FilterDrawer({
  open,
  onClose,
  query,
  onChange,
  options,
  mediaType,
  onRefreshCustomLists,
  customListsRefreshing,
  returnFocusRef,
}: FilterDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inferredReturnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const close = () => {
    const dialog = dialogRef.current
    const returnFocus =
      returnFocusRef?.current ?? inferredReturnFocusRef.current
    if (dialog?.open && typeof dialog.close === 'function') dialog.close()
    onClose()
    window.setTimeout(() => returnFocus?.focus(), 0)
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open || dialog.open) return
    inferredReturnFocusRef.current =
      !returnFocusRef && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
  }, [open, returnFocusRef])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-md overflow-y-auto border-0 bg-slate-50 p-0 text-slate-900 shadow-2xl dark:bg-slate-950 dark:text-slate-100"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <h2 id={titleId} className="text-lg font-bold">
          Filters and sorting
        </h2>
        <button
          type="button"
          aria-label="Close filters and sorting"
          onClick={close}
          className="inline-flex size-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="p-4">
        <FilterRail
          query={query}
          onChange={onChange}
          options={options}
          mediaType={mediaType}
          onRefreshCustomLists={onRefreshCustomLists}
          customListsRefreshing={customListsRefreshing}
          searchAutoFocus
          title="Filter choices"
          className="border-0 p-0 shadow-none"
        />
      </div>
    </dialog>
  )
}
