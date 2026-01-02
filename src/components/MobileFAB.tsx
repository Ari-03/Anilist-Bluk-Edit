import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/store'
import {
    Menu,
    X,
    Filter,
    Edit3,
    User,
    LogOut
} from 'lucide-react'

interface MobileFABProps {
    onFilterClick: () => void
    onBulkEditClick: () => void
    activeFilterCount: number
    selectedCount: number
    onSignOut: () => void
    userName?: string
}

export default function MobileFAB({
    onFilterClick,
    onBulkEditClick,
    activeFilterCount,
    selectedCount,
    onSignOut,
    userName
}: MobileFABProps) {
    const [isOpen, setIsOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    const handleMenuItemClick = (action: () => void) => {
        action()
        setIsOpen(false)
    }

    return (
        <div className="fab-container md:hidden" ref={menuRef}>
            {isOpen && (
                <div className="fab-menu fab-menu-enter">
                    {userName && (
                        <>
                            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <User className="w-4 h-4" />
                                    <span className="font-medium">{userName}</span>
                                </div>
                            </div>
                        </>
                    )}

                    <button
                        onClick={() => handleMenuItemClick(onFilterClick)}
                        className="fab-menu-item"
                    >
                        <Filter className="fab-menu-item-icon" />
                        <span>Filters</span>
                        {activeFilterCount > 0 && (
                            <span className="ml-auto header-toggle-badge">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => handleMenuItemClick(onBulkEditClick)}
                        className="fab-menu-item"
                    >
                        <Edit3 className="fab-menu-item-icon" />
                        <span>Bulk Edit</span>
                        {selectedCount > 0 && (
                            <span className="ml-auto header-toggle-badge">
                                {selectedCount}
                            </span>
                        )}
                    </button>

                    <div className="fab-menu-divider" />

                    <button
                        onClick={() => handleMenuItemClick(onSignOut)}
                        className="fab-menu-item text-red-600 dark:text-red-400"
                    >
                        <LogOut className="fab-menu-item-icon" />
                        <span>Sign Out</span>
                    </button>
                </div>
            )}

            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fab-button"
                aria-label={isOpen ? 'Close menu' : 'Open menu'}
            >
                {isOpen ? (
                    <X className="w-6 h-6" />
                ) : (
                    <Menu className="w-6 h-6" />
                )}
            </button>
        </div>
    )
}
