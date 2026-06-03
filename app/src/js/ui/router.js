/* ===== SPA Tab Router ===== */
import store from '../store.js';

const TABS = ['compress', 'watermark', 'background', 'about'];

let currentTab = 'compress';

/**
 * Switch to a tab by name
 */
export function navigateTo(tab) {
  if (!TABS.includes(tab)) return;
  if (currentTab === tab) return;

  currentTab = tab;
  store.setState({ currentTab: tab });

  // Update page visibility
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.dataset.tab === tab);
  });

  // Update sidebar tabs
  document.querySelectorAll('.sidebar-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  // Update bottom tabs
  document.querySelectorAll('.bottom-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  // Scroll to top of content
  const content = document.getElementById('app-content');
  if (content) content.scrollTop = 0;
}

/**
 * Initialize router
 */
export function initRouter() {
  // Sidebar tab clicks
  document.querySelectorAll('.sidebar-tab').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.tab));
  });

  // Bottom tab clicks
  document.querySelectorAll('.bottom-tab').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.tab));
  });

  // Show initial page
  navigateTo(currentTab);

  // Keyboard shortcuts: Ctrl+1..4 to switch tabs
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      navigateTo(TABS[idx]);
    }
  });
}

export { currentTab, TABS };
