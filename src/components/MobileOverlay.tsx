import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface MobileOverlayProps {
    isOpen: boolean
    onClose: () => void
    title: string
    children: React.ReactNode
}

export default function MobileOverlay({
    isOpen,
    onClose,
    title,
    children
}: MobileOverlayProps) {
    const [animationState, setAnimationState] = useState<'entering' | 'entered' | 'exiting' | 'exited'>('exited')

    useEffect(() => {
        if (isOpen) {
            setAnimationState('entering')
            const timer = setTimeout(() => setAnimationState('entered'), 10)
            return () => clearTimeout(timer)
        } else {
            setAnimationState('exiting')
            const timer = setTimeout(() => setAnimationState('exited'), 300)
            return () => clearTimeout(timer)
        }
    }, [isOpen])

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }

        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    if (animationState === 'exited') {
        return null
    }

    const isVisible = animationState === 'entering' || animationState === 'entered'

    return (
        <div className="md:hidden">
            <div
                className={`mobile-overlay-backdrop ${isVisible ? 'entered' : 'entering'}`}
                onClick={onClose}
            />

            <div className={`mobile-overlay-panel ${isVisible ? 'entered' : 'entering'}`}>
                <div className="mobile-overlay-handle" />
                
                <div className="mobile-overlay-header">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="mobile-overlay-content">
                    {children}
                </div>
            </div>
        </div>
    )
}
