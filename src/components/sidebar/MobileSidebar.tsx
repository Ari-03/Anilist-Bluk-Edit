import { useEffect } from 'react'
import { X } from 'lucide-react'
import Modal, { ModalTitle } from '@/components/ui/Modal'
import SidebarContent from '@/components/sidebar/SidebarContent'

interface MobileSidebarProps {
    open: boolean
    onClose: () => void
}

/** Slide-over drawer for filters on small screens */
export default function MobileSidebar({ open, onClose }: MobileSidebarProps) {
    // The sidebar is inline from md up; close the drawer (and its overlay and
    // scroll lock) if the window grows past that while it's open
    useEffect(() => {
        if (!open) return
        const desktop = window.matchMedia('(min-width: 768px)')
        const closeIfDesktop = () => desktop.matches && onClose()
        closeIfDesktop()
        desktop.addEventListener('change', closeIfDesktop)
        return () => desktop.removeEventListener('change', closeIfDesktop)
    }, [open, onClose])

    return (
        <Modal open={open} onClose={onClose} variant="sheet-left" layer="z-drawer">
            <div className="flex items-center justify-between p-2 pb-0 pl-4">
                <ModalTitle className="sr-only">Filters</ModalTitle>
                <span />
                <button onClick={onClose} className="btn-icon" aria-label="Close filters">
                    <X className="w-5 h-5" />
                </button>
            </div>
            <SidebarContent />
        </Modal>
    )
}
