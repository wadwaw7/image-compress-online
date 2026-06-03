/* ===== Cyberpunk Toast Notification System ===== */

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  container.id = 'toast-container';
  document.body.appendChild(container);
  return container;
}

/**
 * Show a toast notification
 * @param {string} message - Message text
 * @param {'info'|'success'|'error'} type - Toast type
 */
export function showToast(message, type = 'info') {
  const c = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `
    <span style="font-size:16px;flex-shrink:0">${icons[type] || icons.info}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" aria-label="Close">×</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  });

  c.appendChild(toast);

  // Auto-dismiss after 4s
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 200);
    }
  }, 4000);
}

export default { showToast };
