/* ===== App Update Checker =====
   Checks version.json on the server to detect new versions.
   Works for PWA, APK, and EXE builds. */

import { showToast } from './ui/toast.js';
import { t, getLang } from './i18n.js';

const APP_VERSION = '1.0.1';
const CHECK_INTERVAL = 1000 * 60 * 60 * 6; // Check every 6 hours
// Always use absolute URL — works for web, Tauri, and Capacitor
const VERSION_URL = 'https://www.zaixianyasuo.cn/app/version.json';

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
  const isNative = platform === 'exe' || platform === 'apk';
  const primaryUrl = isNative ? '/download.html' : downloadUrl;
  const lang = getLang();

  overlay.innerHTML = `
    <div class="card" style="width:420px;max-width:90vw;animation:scaleIn 0.3s var(--ease-out)">
      <div class="card-header">
        <h3 style="color:var(--neon-magenta)">▸ ${t('updater.title')}</h3>
        <button class="btn ghost" id="update-close" style="padding:4px 8px;font-size:16px">✕</button>
      </div>
      <div style="font-family:var(--font-mono);font-size:13px;line-height:1.8;color:var(--text-secondary)">
        <p><span class="text-cyan">${t('updater.current_version')}:</span> v${APP_VERSION}</p>
        <p><span class="text-magenta">${t('updater.latest_version')}:</span> v${latest}</p>
        <p class="mt-12" style="color:var(--text-dim);font-size:11px">${updateInfo.releaseNotes || ''}</p>
        <div class="mt-16" style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn primary" id="update-download" style="flex:1;min-width:140px">⬇ ${t('updater.download_btn')}</button>
          ${isNative ? `<button class="btn ghost" id="update-direct" style="font-size:12px">${t('updater.direct_download')}</button>` : ''}
          <button class="btn ghost" id="update-later">${t('updater.remind_later')}</button>
        </div>
        <p style="margin-top:8px;font-size:11px;color:var(--text-dim)">
          <a href="/changelog.html" target="_blank" style="color:var(--neon-cyan)">${t('updater.view_changelog')}</a>
        </p>
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
    localStorage.setItem('update_last_check', String(Date.now() + 24 * 60 * 60 * 1000));
  });
  overlay.querySelector('#update-download').addEventListener('click', () => {
    window.open(primaryUrl, '_blank');
  });
  const directBtn = overlay.querySelector('#update-direct');
  if (directBtn) {
    directBtn.addEventListener('click', () => {
      window.open(downloadUrl, '_blank');
    });
  }
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
  const lastCheck = parseInt(localStorage.getItem('update_last_check') || '0');
  if (!silent && Date.now() - lastCheck < 60000) {
    showToast(t('updater.checked_recently'), 'info');
    return null;
  }

  try {
    const url = VERSION_URL + '?t=' + Date.now();
    const resp = await fetch(url, {
      cache: 'no-cache',
      headers: { 'Accept': 'application/json' }
    });

    if (!resp.ok) {
      if (!silent) showToast(t('updater.check_failed'), 'error');
      return null;
    }

    const info = await resp.json();
    localStorage.setItem('update_last_check', String(Date.now()));

    if (!info.version) return null;

    const cmp = compareVersions(APP_VERSION, info.version);

    if (cmp < 0) {
      const minOk = !info.minAppVersion || compareVersions(APP_VERSION, info.minAppVersion) >= 0;
      if (!minOk) {
        showToast(`${t('updater.title')}! v${info.version} ${t('about.new_version')}.`, 'error');
      }
      showUpdateModal(info.version, info);
      return { hasUpdate: true, latest: info.version, info };
    }

    if (!silent) {
      showToast(t('updater.no_update') + ' (v' + APP_VERSION + ')', 'success');
    }
    return { hasUpdate: false, latest: APP_VERSION, info };

  } catch (e) {
    if (!silent) showToast(t('updater.check_failed'), 'error');
    console.warn('Update check failed:', e);
    return null;
  }
}

/**
 * Start periodic update checks
 */
export function startUpdateChecks() {
  setTimeout(() => checkForUpdates(true), 5000);
  setInterval(() => checkForUpdates(true), CHECK_INTERVAL);
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
