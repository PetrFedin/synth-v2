(() => {
  const search = typeof window.location?.search === 'string' ? window.location.search : '';
  const match = search.match(/(?:^|[?&])viewport=([^&]+)/i);
  let requested = '';
  if (match) {
    try { requested = decodeURIComponent(match[1]).trim().toLowerCase(); }
    catch { requested = ''; }
  }
  const mode = ['monitor', 'tablet', 'phone'].includes(requested) ? requested : 'auto';
  const root = typeof document === 'object' ? document.documentElement : null;
  if (root?.dataset) root.dataset.viewportMode = mode;
  root?.classList?.toggle?.('syntha-viewport-preview', mode !== 'auto');
  window.SynthaViewportMode = Object.freeze({
    mode,
    isPreview: mode !== 'auto',
    isTablet: mode === 'tablet',
    isPhone: mode === 'phone',
    isMonitor: mode === 'monitor',
  });
})();
