/* ===== App Update Checker =====
   Checks version.json on the server to detect new versions.
   Works for PWA, APK, and EXE builds. */

import { showToast } from './ui/toast.js';
import { getToken } from './auth.js';

const APP_VERSION = '1.0.0';
const CHECK_INTERVAL = 1000 * 60 * 60 * 6; // Check every 6 hours
const VERSION_URL = '/app/version.json'; // Served by nginx from public/app/

let updateModalShown = false;

/**
 * Compare semantic versions
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/**
 * Show update notification modal
 */
function showUpdateModal(latest, updateInfo) {
  if (updateModalShown) return;
  updateModalShown = true;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px)';

  const platform = getPlatform();
  const downloadUrl = updateInfo.downloads?.[platform] || updateInfo.downloads?.pwa || '/app/';

  overlay.innerHTML = `
    <div class="card" style="width:420px;max-width:90vw;animation:scaleIn 0.3s var(--ease-out)">
      <div class="card-header">
        <h3 style="color:var(--neon-magenta)">▸ UPDATE AVAILABLE</h3>
        <button class="btn ghost" id="update-close" style="padding:4px 8px;font-size:16px">✕</button>
      </div>
      <div style="font-family:var(--font-mono);font-size:13px;line-height:1.8;color:var(--text-secondary)">
        <p><span class="text-cyan">Current:</span> v${APP_VERSION}</p>
        <p><span class="text-magenta">Latest:</span> v${latest}</p>
        <p class="mt-12" style="color:var(--text-dim);font-size:11px">${updateInfo.releaseNotes || ''}</p>
        <div class="mt-16" style="display:flex;gap:10px">
          <button class="btn primary" id="update-download" style="flex:1">⬇ DOWNLOAD UPDATE</button>
          <button class="btn ghost" id="update-later">REMIND LATER</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    updateModalShown = false;
  };

  overlay.querySelector('#update-close').addEventListener('click', close);
  overlay.querySelector('#update-later').addEventListener('click', () => {
    close();
    // Schedule next check in 1 day
    localStorage.setItem('update_last_check', String(Date.now() + 24 * 60 * 60 * 1000));
  });
  overlay.querySelector('#update-download').addEventListener('click', () => {
    window.open(downloadUrl, '_blank');
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

/**
 * Detect current platform
 */
function getPlatform() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'apk';
  if (/windows/i.test(ua)) return 'exe';
  return 'pwa';
}

/**
 * Check for updates
 * @param {boolean} silent - If true, don't show "no update" messages
 * @returns {Promise<{hasUpdate:boolean, latest:string, info:object}|null>}
 */
export async function checkForUpdates(silent = true) {
  // Check last check time
  const lastCheck = parseInt(localStorage.getItem('update_last_check') || '0');
  if (!silent && Date.now() - lastCheck < 60000) {
    showToast('Checked recently. Please wait before checking again.', 'info');
    return null;
  }

  try {
    const resp = await fetch(VERSION_URL + '?t=' + Date.now(), {
      cache: 'no-cache',
      headers: { 'Accept': 'application/json' }
    });

    if (!resp.ok) {
      if (!silent) showToast('Failed to check for updates. Server unreachable.', 'error');
      return null;
    }

    const info = await resp.json();
    localStorage.setItem('update_last_check', String(Date.now()));

    if (!info.version) return null;

    const cmp = compareVersions(APP_VERSION, info.version);

    if (cmp < 0) {
      // Update available
      const minOk = !info.minAppVersion || compareVersions(APP_VERSION, info.minAppVersion) >= 0;
      if (!minOk) {
        showToast(`Critical update required! v${info.version} is available.`, 'error');
      }
      showUpdateModal(info.version, info);
      return { hasUpdate: true, latest: info.version, info };
    }

    if (!silent) {
      showToast('You are running the latest version (v' + APP_VERSION + ')', 'success');
    }
    return { hasUpdate: false, latest: APP_VERSION, info };

  } catch (e) {
    if (!silent) showToast('Update check failed: ' + (e.message || 'Network error'), 'error');
    console.warn('Update check failed:', e);
    return null;
  }
}

/**
 * Start periodic update checks
 */
export function startUpdateChecks() {
  // Check on startup (silently)
  setTimeout(() => checkForUpdates(true), 5000);

  // Check periodically
  setInterval(() => checkForUpdates(true), CHECK_INTERVAL);

  // Also check when coming back online
  window.addEventListener('online', () => {
    setTimeout(() => checkForUpdates(true), 2000);
  });
}

/**
 * Get current app version
 */
export function getAppVersion() {
  return APP_VERSION;
}

export { APP_VERSION };
