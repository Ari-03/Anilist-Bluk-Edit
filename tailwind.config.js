/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    safelist: [
        // Status colors for media entries
        'bg-green-500',
        'bg-blue-500',
        'bg-purple-500',
        'bg-red-500',
        'bg-orange-500',
        'bg-indigo-500',
        'bg-gray-500'
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                anilist: {
                    blue: '#3DB4F2',
                    'blue-dark': '#2E86C1',
                    gray: {
                        50: '#F8FAFC',
                        100: '#F1F5F9',
                        900: '#0F172A',
                    },
                },
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-in-out',
                'slide-up': 'slideUp 0.3s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
            },
        },
    },
    plugins: [],
} 