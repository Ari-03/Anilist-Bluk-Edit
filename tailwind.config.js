const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/hooks/**/*.{js,ts,jsx,tsx,mdx}',
        './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                page: 'rgb(var(--c-page) / <alpha-value>)',
                surface: 'rgb(var(--c-surface) / <alpha-value>)',
                raised: 'rgb(var(--c-raised) / <alpha-value>)',
                edge: 'rgb(var(--c-edge) / <alpha-value>)',
                fg: {
                    DEFAULT: 'rgb(var(--c-fg) / <alpha-value>)',
                    muted: 'rgb(var(--c-fg-muted) / <alpha-value>)',
                    subtle: 'rgb(var(--c-fg-subtle) / <alpha-value>)',
                },
                accent: {
                    DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
                    hover: 'rgb(var(--c-accent-hover) / <alpha-value>)',
                },
                purple: {
                    DEFAULT: 'rgb(var(--c-purple) / <alpha-value>)',
                    hover: 'rgb(var(--c-purple-hover) / <alpha-value>)',
                },
                success: 'rgb(var(--c-success) / <alpha-value>)',
                danger: 'rgb(var(--c-danger) / <alpha-value>)',
                warning: 'rgb(var(--c-warning) / <alpha-value>)',
                status: {
                    current: 'rgb(var(--c-status-current) / <alpha-value>)',
                    planning: 'rgb(var(--c-status-planning) / <alpha-value>)',
                    completed: 'rgb(var(--c-status-completed) / <alpha-value>)',
                    dropped: 'rgb(var(--c-status-dropped) / <alpha-value>)',
                    paused: 'rgb(var(--c-status-paused) / <alpha-value>)',
                    repeating: 'rgb(var(--c-status-repeating) / <alpha-value>)',
                },
            },
            fontFamily: {
                sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
            },
            boxShadow: {
                card: 'var(--shadow-card)',
                raised: 'var(--shadow-raised)',
                overlay: 'var(--shadow-overlay)',
            },
            /* Layering scale — anything that pops up sits above page content;
               popovers are topmost so flyouts are never covered */
            zIndex: {
                header: '30',
                toolbar: '40',
                drawer: '50',
                dropdown: '50',
                notification: '60',
                modal: '90',
                confirm: '100',
                popover: '110',
            },
        },
    },
    plugins: [],
}
