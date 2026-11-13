// Runs before first paint (blocking <script> in _document) so a returning
// user never sees a flash of the wrong theme or accent. Mirrors the store's
// darkMode (dark by default) and accentColor (ids from src/lib/accent.ts).
;(function () {
    var dark = true
    var accent = 'purple'
    try {
        var saved = JSON.parse(localStorage.getItem('anilist-bulk-edit-store') || 'null')
        var state = saved && saved.state
        if (state && typeof state.darkMode === 'boolean') dark = state.darkMode
        if (state && ['purple', 'blue', 'teal', 'green', 'pink', 'orange'].indexOf(state.accentColor) !== -1) {
            accent = state.accentColor
        }
    } catch (e) {}
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.dataset.accent = accent
})()
