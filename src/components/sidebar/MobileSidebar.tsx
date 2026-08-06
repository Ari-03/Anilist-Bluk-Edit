import { useEffect } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { X } from 'lucide-react'
import SidebarContent from '@/components/sidebar/SidebarContent'

interface MobileSidebarProps {
    open: boolean
    onClose: () => void
}

/** Slide-over drawer for filters on small screens */
export default function MobileSidebar({ open, onClose }: MobileSidebarProps) {
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-drawer md:hidden">
                    <m.div
                        className="absolute inset-0 bg-black/50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={onClose}
                    />
                    <m.aside
                        className="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-surface shadow-overlay overflow-y-auto"
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                    >
                        <div className="flex justify-end p-2 pb-0">
                            <button onClick={onClose} className="btn-icon" title="Close filters">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <SidebarContent />
                    </m.aside>
                </div>
            )}
        </AnimatePresence>
    )
}
