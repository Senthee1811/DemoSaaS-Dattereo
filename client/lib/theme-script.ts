// Shared by the server layout (inline script) and the client theme hook. Not a client module.
export const THEME_STORAGE_KEY = 'spendguard_theme';

/**
 * Runs in <head> during HTML parsing (app/layout.tsx), so the right theme is on <html>
 * before the first paint. Keep it tiny, dependency-free and in sync with applyTheme().
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
