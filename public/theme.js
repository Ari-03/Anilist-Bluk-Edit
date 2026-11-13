// Runs before first paint (blocking <script> in _document) so a returning
// user never sees a flash of the wrong theme, accent or cover size. Mirrors
// the store's darkMode (dark by default), accentColor (ids from
// src/lib/accent.ts) and coverSize (bounds from src/lib/coverSize.ts).
;(function () {
    var dark = true
    var accent = 'purple'
    var coverSize = 160
    try {
        var saved = JSON.parse(localStorage.getItem('anilist-bulk-edit-store') || 'null')
        var state = saved && saved.state
        if (state && typeof state.darkMode === 'boolean') dark = state.darkMode
        if (state && ['purple', 'blue', 'teal', 'green', 'pink', 'orange'].indexOf(state.accentColor) !== -1) {
            accent = state.accentColor
        }
        if (state && typeof state.coverSize === 'number' && state.coverSize >= 100 && state.coverSize <= 240) {
            coverSize = state.coverSize
        }
    } catch (e) {}
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.dataset.accent = accent
    document.documentElement.style.setProperty('--cover-min', coverSize + 'px')
})()
