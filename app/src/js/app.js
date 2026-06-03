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
    titleEl.textContent = '▸ LOGIN';
    hideError();
  };

  const showRegister = () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    titleEl.textContent = '▸ REGISTER';
    hideError();
  };

  // Open modal
  document.getElementById('sidebar-login-btn').addEventListener('click', () => {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
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
    if (!username || !password) return showError('Please fill in both fields.');

    const btn = document.getElementById('login-submit');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      await login(username, password, remember);
      modal.classList.add('hidden');
      modal.style.display = 'none';
      showToast('Login successful! Server features now available.', 'success');
      updateLoginUI();
    } catch (e) {
      showError(e.message || 'Login failed');
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ LOGIN';
    }
  });

  // Register submit
  document.getElementById('reg-submit').addEventListener('click', async () => {
    hideError();
    const username = document.getElementById('reg-username').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!username || !password) return showError('Username and password are required.');
    if (password.length < 6) return showError('Password must be at least 6 characters.');

    const btn = document.getElementById('reg-submit');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      await register(username, nickname, password);
      modal.classList.add('hidden');
      modal.style.display = 'none';
      showToast('Account created! Welcome, ' + (nickname || username), 'success');
      updateLoginUI();
    } catch (e) {
      showError(e.message || 'Registration failed');
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ REGISTER';
    }
  });

  // Logout
  document.getElementById('sidebar-logout-btn').addEventListener('click', () => {
    logout();
    updateLoginUI();
  });

  // Enter key in password field submits login
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
}

// ===== Update UI based on login state =====
function updateLoginUI() {
  const loggedIn = isLoggedIn();
  const btn = document.getElementById('sidebar-login-btn');
  const info = document.getElementById('sidebar-user-info');
  const nameEl = document.getElementById('sidebar-user-name');

  if (loggedIn) {
    btn.classList.add('hidden');
    info.classList.remove('hidden');
    const user = store.get('user');
    nameEl.textContent = user ? (user.nickname || user.username) : 'Logged In';
  } else {
    btn.classList.remove('hidden');
    info.classList.add('hidden');
  }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  // Init auth (restores existing token from localStorage)
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

  // Start periodic update checks
  startUpdateChecks();

  // Register service worker for offline support
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      console.log('SW registered:', reg.scope);
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  }

  // Global drag-and-drop: files dropped anywhere go to compress page
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      store.setState({ currentTab: 'compress' });
      const { navigateTo } = require('./ui/router.js');
      // Import dynamically to avoid circular dependency, use the router
      document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.dataset.tab === 'compress');
      });
      document.querySelectorAll('.sidebar-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === 'compress');
      });
      document.querySelectorAll('.bottom-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === 'compress');
      });
      // Trigger file input
      const input = document.getElementById('compress-input');
      if (input) {
        const dt = new DataTransfer();
        for (const f of files) dt.items.add(f);
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
      }
    }
  });

  // About page: version display & update check button
  const aboutVersion = document.getElementById('about-version');
  if (aboutVersion) aboutVersion.textContent = 'v' + getAppVersion();

  const checkBtn = document.getElementById('about-check-update');
  const checkStatus = document.getElementById('about-update-status');
  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      checkBtn.disabled = true;
      checkBtn.textContent = '... CHECKING ...';
      checkStatus.textContent = '';
      const result = await checkForUpdates(false);
      checkBtn.disabled = false;
      checkBtn.textContent = '🔄 CHECK FOR UPDATES';
      if (result) {
        checkStatus.textContent = result.hasUpdate
          ? `New version available: v${result.latest}`
          : 'You are up to date!';
        checkStatus.style.color = result.hasUpdate ? 'var(--neon-magenta)' : 'var(--neon-green)';
      } else {
        checkStatus.textContent = 'Check failed. Try again later.';
        checkStatus.style.color = 'var(--neon-red)';
      }
    });
  }

  console.log('⚡ ImageCompress Cyberpunk Edition ready');
  console.log('🔐 Auth:', isLoggedIn() ? 'Logged in (server features enabled)' : 'Offline mode (local processing only)');
});
