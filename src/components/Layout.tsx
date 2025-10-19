'use client'

import { ReactNode } from 'react'
import { ImageKitProvider } from 'imagekitio-next'

interface LayoutProps {
    children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
    const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT

    return (
        <ImageKitProvider urlEndpoint={urlEndpoint}>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
                {children}
            </div>
        </ImageKitProvider>
    )
} 