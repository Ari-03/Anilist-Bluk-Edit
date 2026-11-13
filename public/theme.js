// Runs before first paint (blocking <script> in _document) so a dark-mode
// user never sees a flash of the light theme. Mirrors the store's darkMode,
// which defaults to dark.
;(function () {
    var dark = true
    try {
        var saved = JSON.parse(localStorage.getItem('anilist-bulk-edit-store') || 'null')
        if (saved && saved.state && typeof saved.state.darkMode === 'boolean') dark = saved.state.darkMode
    } catch (e) {}
    document.documentElement.classList.toggle('dark', dark)
})()
