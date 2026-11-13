import { X } from 'lucide-react'
import Modal, { ModalTitle } from '@/components/ui/Modal'
import SidebarContent from '@/components/sidebar/SidebarContent'

interface MobileSidebarProps {
    open: boolean
    onClose: () => void
}

/** Slide-over drawer for filters on small screens */
export default function MobileSidebar({ open, onClose }: MobileSidebarProps) {
    return (
        <Modal open={open} onClose={onClose} variant="sheet-left" layer="z-drawer" className="md:hidden">
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
