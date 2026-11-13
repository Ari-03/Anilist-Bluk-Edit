import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useStore } from '@/store'
import Modal, { ModalTitle } from '@/components/ui/Modal'
import SidebarContent from '@/components/sidebar/SidebarContent'

interface MobileSidebarProps {
    open: boolean
    onClose: () => void
}

/** Slide-over filter drawer for screens narrower than lg (phones and portrait tablets) */
export default function MobileSidebar({ open, onClose }: MobileSidebarProps) {
    const shown = useStore(s => s.filteredEntries.length)

    // The sidebar is inline from lg up; close the drawer (and its overlay and
    // scroll lock) if the window grows past that while it's open
    useEffect(() => {
        if (!open) return
        const desktop = window.matchMedia('(min-width: 1024px)')
        const closeIfDesktop = () => desktop.matches && onClose()
        closeIfDesktop()
        desktop.addEventListener('change', closeIfDesktop)
        return () => desktop.removeEventListener('change', closeIfDesktop)
    }, [open, onClose])

    return (
        <Modal open={open} onClose={onClose} variant="sheet-left" layer="z-drawer" className="flex flex-col overflow-hidden">
            <ModalTitle className="sr-only">Filters</ModalTitle>
            <div className="flex-1 overflow-y-auto">
                <SidebarContent inline />
            </div>
            <button onClick={onClose} className="btn-icon absolute right-2 top-2" aria-label="Close filters">
                <X className="w-5 h-5" />
            </button>
            {/* The list updates live behind the drawer; this says so and gives filtering an obvious finish */}
            <div className="border-t border-edge p-3">
                <button onClick={onClose} className="btn-primary w-full">
                    Show {shown.toLocaleString()} {shown === 1 ? 'entry' : 'entries'}
                </button>
            </div>
        </Modal>
    )
}
