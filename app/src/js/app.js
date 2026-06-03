/* ===== ImageCompress Cyberpunk Edition — App Entry ===== */
import store from './store.js';
import { initRouter } from './ui/router.js';
import { initNavbar } from './ui/navbar.js';
import { initFX } from './ui/fx.js';
import { showToast } from './ui/toast.js';
import { initAuth, login, register, logout, isLoggedIn, getToken } from './auth.js';
import { initCompressPage } from './pages/compress-page.js';
import { initWatermarkPage } from './pages/watermark-page.js';
import { initBgPage } from './pages/bg-page.js';
import { startUpdateChecks, getAppVersion, checkForUpdates } from './updater.js';
import { t, getLang, setLang, initI18n, currentLang } from './i18n.js';

/** Apply translations to all [data-i18n] elements */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
  // Also update placeholder texts
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

/** Update sidebar button texts based on login state */
function updateLoginUI() {
  const loggedIn = isLoggedIn();
  const btn = document.getElementById('sidebar-login-btn');
  const info = document.getElementById('sidebar-user-info');
  const nameEl = document.getElementById('sidebar-user-name');

  if (loggedIn) {
    btn.classList.add('hidden');
    info.classList.remove('hidden');
    const user = store.get('user');
    nameEl.textContent = user ? (user.nickname || user.username) : t('auth.logged_in_as');
  } else {
    btn.classList.remove('hidden');
    info.classList.add('hidden');
    // Show offline status - login is optional
    btn.textContent = '⚡ ' + t('app.login') + ' (' + t('compress.settings') + ')';
  }

  const logoutBtn = document.getElementById('sidebar-logout-btn');
  if (logoutBtn) logoutBtn.textContent = t('app.logout');
  updateLoginModalLang();
}

function updateLoginModalLang() {
  const titleEl = document.getElementById('login-modal-title');
  const isLogin = !document.getElementById('register-form').classList.contains('hidden');
  if (titleEl) titleEl.textContent = '▸ ' + (isLogin ? t('auth.login_title') : t('auth.register_title'));

  const loginBtn = document.getElementById('login-submit');
  if (loginBtn) loginBtn.textContent = '⚡ ' + t('app.login');
  const regBtn = document.getElementById('reg-submit');
  if (regBtn) regBtn.textContent = '⚡ ' + t('app.register');

  document.getElementById('login-username').placeholder = t('auth.username_placeholder');
  document.getElementById('login-password').placeholder = t('auth.password_placeholder');
  document.getElementById('reg-username').placeholder = t('auth.username_placeholder');
  document.getElementById('reg-nickname').placeholder = t('auth.email_placeholder');
  document.getElementById('reg-password').placeholder = t('auth.password_placeholder');

  document.getElementById('login-switch-register').textContent = t('auth.switch_to_register');
  document.getElementById('reg-switch-login').textContent = t('auth.switch_to_login');
}

// ===== Login Modal =====
function initLoginModal() {
  const modal = document.getElementById('login-modal');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const errorEl = document.getElementById('login-error');
  const titleEl = document.getElementById('login-modal-title');

  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  };
  const hideError = () => errorEl.classList.add('hidden');

  const showLogin = () => {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    titleEl.textContent = '▸ ' + t('auth.login_title');
    hideError();
  };

  const showRegister = () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    titleEl.textContent = '▸ ' + t('auth.register_title');
    hideError();
  };

  // Open modal
  document.getElementById('sidebar-login-btn').addEventListener('click', () => {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    updateLoginModalLang();
    showLogin();
  });

  // Close modal
  document.getElementById('login-modal-close').addEventListener('click', () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  });

  // Switch forms
  document.getElementById('login-switch-register').addEventListener('click', showRegister);
  document.getElementById('reg-switch-login').addEventListener('click', showLogin);

  // Login submit
  document.getElementById('login-submit').addEventListener('click', async () => {
    hideError();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('login-remember').checked;
    if (!username || !password) return showError(t('auth.login_failed'));

    const btn = document.getElementById('login-submit');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      await login(username, password, remember);
      modal.classList.add('hidden');
      modal.style.display = 'none';
      showToast(t('app.login_success'), 'success');
      updateLoginUI();
    } catch (e) {
      showError(e.message || t('auth.login_failed'));
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ ' + t('app.login');
    }
  });

  // Register submit
  document.getElementById('reg-submit').addEventListener('click', async () => {
    hideError();
    const username = document.getElementById('reg-username').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!username || !password) return showError(t('auth.register_failed'));
    if (password.length < 6) return showError('Password must be at least 6 characters.');

    const btn = document.getElementById('reg-submit');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      await register(username, nickname, password);
      modal.classList.add('hidden');
      modal.style.display = 'none';
      showToast(t('app.register_success') + '! ' + t('nav.about') + ', ' + (nickname || username), 'success');
      updateLoginUI();
    } catch (e) {
      showError(e.message || t('auth.register_failed'));
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ ' + t('app.register');
    }
  });

  // Logout
  document.getElementById('sidebar-logout-btn').addEventListener('click', () => {
    logout();
    updateLoginUI();
    showToast(t('app.logout_success'), 'info');
  });

  // Enter key
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('login-submit').click();
  });
  document.getElementById('reg-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('reg-submit').click();
  });

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  });

  // Init placeholder translations
  updateLoginModalLang();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  // Init i18n
  initI18n();
  applyTranslations();

  // Language switcher
  const langSwitcher = document.getElementById('lang-switcher');
  if (langSwitcher) {
    langSwitcher.value = getLang();
    langSwitcher.addEventListener('change', () => {
      setLang(langSwitcher.value);
      applyTranslations();
      updateLoginUI();
      // Update about page texts
      updateAboutPageLang();
      // Update page-specific display
      updatePageLangs();
    });
  }

  // Init auth
  initAuth();
  updateLoginUI();

  // Init login modal
  initLoginModal();

  // Init router & navbar
  initRouter();
  initNavbar();

  // Init ambient FX
  initFX();

  // Init page controllers
  initCompressPage();
  initWatermarkPage();
  initBgPage();

  // Detect native app environment
  const isNative = !!(window.__TAURI__ || window.__TAURI_INTERNALS__ || window.Capacitor ||
    (!location.protocol.startsWith('http') && location.protocol !== 'file:'));

  // Start periodic update checks (non-blocking, silent errors)
  startUpdateChecks();

  // Register service worker (web only - not needed in native apps)
  if (!isNative && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      console.log('SW registered:', reg.scope);
    } catch (e) {
      console.warn('SW registration failed (expected in dev mode):', e.message);
    }
  }

  // Global drag-and-drop
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      store.setState({ currentTab: 'compress' });
      // Navigate to compress tab
      import('./ui/router.js').then(m => m.navigateTo('compress')).catch(() => {
        // Fallback: manual tab switch
        document.querySelectorAll('.page').forEach(p => {
          p.classList.toggle('active', p.dataset.tab === 'compress');
        });
        document.querySelectorAll('.sidebar-tab').forEach(el => {
          el.classList.toggle('active', el.dataset.tab === 'compress');
        });
        document.querySelectorAll('.bottom-tab').forEach(el => {
          el.classList.toggle('active', el.dataset.tab === 'compress');
        });
      });
      const input = document.getElementById('compress-input');
      if (input) {
        const dt = new DataTransfer();
        for (const f of files) dt.items.add(f);
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
      }
    }
  });

  // About page init
  const aboutVersion = document.getElementById('about-version');
  if (aboutVersion) aboutVersion.textContent = 'v' + getAppVersion();

  const checkBtn = document.getElementById('about-check-update');
  const checkStatus = document.getElementById('about-update-status');
  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      checkBtn.disabled = true;
      checkBtn.textContent = '... ' + t('updater.checking');
      checkStatus.textContent = '';
      const result = await checkForUpdates(false);
      checkBtn.disabled = false;
      checkBtn.textContent = '🔄 ' + t('about.check_update_btn');
      if (result) {
        checkStatus.textContent = result.hasUpdate
          ? t('about.new_version') + ': v' + result.latest
          : t('about.latest_version');
        checkStatus.style.color = result.hasUpdate ? 'var(--neon-magenta)' : 'var(--neon-green)';
      } else {
        checkStatus.textContent = t('updater.check_failed');
        checkStatus.style.color = 'var(--neon-red)';
      }
    });
  }

  // Listen for language changes from other components
  window.addEventListener('langchange', () => {
    applyTranslations();
    updateLoginUI();
    updateAboutPageLang();
    updatePageLangs();
  });

  console.log('⚡ ImageCompress Cyberpunk Edition ready');
  console.log('🔐 Auth:', isLoggedIn() ? 'Logged in' : 'Offline mode');
});

/** Update about page texts */
function updateAboutPageLang() {
  const aboutVersionLabel = document.querySelector('#about-version')?.previousElementSibling;
  // Update about check button
  const checkBtn = document.getElementById('about-check-update');
  if (checkBtn && !checkBtn.disabled) {
    checkBtn.textContent = '🔄 ' + t('about.check_update_btn');
  }
}

/** Update page-specific language displays */
function updatePageLangs() {
  // Update compress page
  const dropTitle = document.querySelector('#compress-dropzone .dz-title');
  if (dropTitle) dropTitle.textContent = t('compress.drag_text');
  const dropHint = document.querySelector('#compress-dropzone .dz-hint');
  if (dropHint) dropHint.textContent = t('compress.browse');

  // Update watermark tip
  const wmTip = document.querySelector('[data-i18n-tip="watermark"]');
  if (wmTip) wmTip.textContent = t('watermark.tip_mobile');
}
