/**
 * ImageKit.io custom loader for Next.js Image component
 *
 * This loader routes images through ImageKit CDN for optimization
 * Supports external URLs (like AniList cover images)
 */

export interface ImageKitLoaderProps {
  src: string
  width: number
  quality?: number
}

/**
 * Custom image loader for ImageKit.io
 * @param src - Image source URL
 * @param width - Desired image width
 * @param quality - Image quality (1-100)
 * @returns Optimized ImageKit URL
 */
export default function imageKitLoader({ src, width, quality }: ImageKitLoaderProps): string {
  // Get ImageKit URL endpoint from environment
  const imageKitEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT

  // If ImageKit is not configured, return original URL
  if (!imageKitEndpoint) {
    console.warn('NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT is not set. Using original image URL.')
    return src
  }

  // If src is already from ImageKit, return as-is
  if (src.includes('imagekit.io')) {
    return src
  }

  // Build ImageKit transformation URL
  const params = new URLSearchParams()

  // Add transformations
  params.set('tr', `w-${width}${quality ? `,q-${quality}` : ''}`)

  // Clean up the ImageKit endpoint (remove trailing slash)
  const endpoint = imageKitEndpoint.replace(/\/$/, '')

  // Encode the source URL for use as a path parameter
  // For external URLs, use them directly after the endpoint
  const encodedSrc = encodeURIComponent(src)

  // Return ImageKit URL with transformations
  // Format: https://ik.imagekit.io/your_id/tr:w-400,q-80/https://external.com/image.jpg
  return `${endpoint}/${params.toString()}/${src}`
}
