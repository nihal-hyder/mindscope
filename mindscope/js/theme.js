/* ==========================================================================
   MindScope — Theme bootstrap
   Loaded in <head> (not deferred) so the saved theme is applied before the
   first paint. Light is the default; a saved choice overrides it.
   ========================================================================== */
(function () {
  var theme = "light";
  try {
    var saved = localStorage.getItem("mindscope-theme");
    if (saved === "light" || saved === "dark") theme = saved;
  } catch (e) { /* storage unavailable: keep the default */ }
  document.documentElement.setAttribute("data-theme", theme);
})();
