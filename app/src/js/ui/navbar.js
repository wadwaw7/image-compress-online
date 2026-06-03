/* ===== Cyberpunk Navbar (Sidebar + Bottom Tabs) ===== */

/**
 * Initialize the sidebar navigation
 * Called once on app startup
 */
export function initNavbar() {
  // Sidebar tabs are created via HTML template
  // Bottom tabs are created via HTML template
  // This module handles dynamic behaviors like:
  // - Active state (handled by router.js)
  // - Window resize handling (CSS handles layout)
  // - Any extra nav items

  // Handle window resize to update layout
  const resizeHandler = () => {
    const isMobile = window.innerWidth <= 768;
    document.body.classList.toggle('is-mobile', isMobile);
    document.body.classList.toggle('is-desktop', !isMobile);
  };

  window.addEventListener('resize', resizeHandler);
  resizeHandler();
}
