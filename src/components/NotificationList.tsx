import { useStore } from '@/store'
import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    Info,
    X
} from 'lucide-react'

export default function NotificationList() {
    const { notifications, removeNotification } = useStore()

    if (notifications.length === 0) return null

    const getIcon = (type: string) => {
        switch (type) {
            case 'success':
                return <CheckCircle className="w-5 h-5 text-green-500" />
            case 'error':
                return <XCircle className="w-5 h-5 text-red-500" />
            case 'warning':
                return <AlertTriangle className="w-5 h-5 text-yellow-500" />
            case 'info':
                return <Info className="w-5 h-5 text-blue-500" />
            default:
                return <Info className="w-5 h-5 text-gray-500" />
        }
    }

    const getColor = (type: string) => {
        switch (type) {
            case 'success':
                return 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
            case 'error':
                return 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
            case 'warning':
                return 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200'
            case 'info':
                return 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200'
            default:
                return 'bg-gray-50 border-gray-200 text-gray-800 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200'
        }
    }

    return (
        <div className="fixed top-4 right-4 z-50 space-y-2 w-96 max-w-[calc(100vw-2rem)]">
            {notifications.map((notification) => (
                <div
                    key={notification.id}
                    className={`
            ${getColor(notification.type)}
            border rounded-lg p-4 shadow-lg
            transform transition-all duration-300 ease-in-out
            animate-slide-in-right
          `}
                >
                    <div className="flex items-start gap-3">
                        {getIcon(notification.type)}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium break-words">
                                {notification.message}
                            </p>
                        </div>
                        <button
                            onClick={() => removeNotification(notification.id)}
                            className="flex-shrink-0 p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
                            aria-label="Dismiss notification"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    )
} 