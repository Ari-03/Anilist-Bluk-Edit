interface DefaultCoverProps {
  className?: string
  size?: 'small' | 'large'
}

export default function DefaultCover({ className = '', size = 'large' }: DefaultCoverProps) {
  const isSmall = size === 'small'
  
  return (
    <div className={`bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center ${className}`}>
      <svg
        width={isSmall ? "24" : "48"}
        height={isSmall ? "32" : "64"}
        viewBox="0 0 24 32"
        fill="none"
        className="text-gray-500 dark:text-gray-400"
      >
        <rect
          x="2"
          y="2"
          width="20"
          height="28"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <rect
          x="6"
          y="6"
          width="12"
          height="2"
          rx="1"
          fill="currentColor"
        />
        <rect
          x="6"
          y="10"
          width="8"
          height="1.5"
          rx="0.75"
          fill="currentColor"
        />
        <rect
          x="6"
          y="13"
          width="10"
          height="1.5"
          rx="0.75"
          fill="currentColor"
        />
      </svg>
    </div>
  )
}