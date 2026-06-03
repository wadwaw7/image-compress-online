/* ===== Auth Module — Shared account with website =====
   Uses the same backend API and localStorage token key as zaixianyasuo.cn
   so accounts work seamlessly between the app and the website. */

import store from './store.js';
import { showToast } from './ui/toast.js';

const TOKEN_KEY = 'token';
const USER_CACHE_KEY = 'ic_user_cache';

let API_BASE = '';

/**
 * Initialize API base URL (same logic as website)
 */
export function initApiBase() {
  const isFile = location.protocol === 'file:';
  try {
    const forced = new URLSearchParams(location.search).get('api');
    if (!isFile) {
      API_BASE = (forced && forced !== 'self') ? forced : '';
    } else {
      let cached = null;
      try { cached = localStorage.getItem('api_base'); } catch (_) {}
      API_BASE = forced || cached || 'https://www.zaixianyasuo.cn';
    }
  } catch (_) {
    API_BASE = isFile ? 'https://www.zaixianyasuo.cn' : '';
  }
  window.API_BASE = API_BASE;
}

/**
 * Get current token
 */
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
}

/**
 * Set token and cache user info
 */
export function setToken(token, user) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    if (user) {
      try {
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify({
          name: user.nickname || user.username,
          t: Date.now()
        }));
      } catch (_) {}
    }
    store.setState({ token, user });
  } else {
    localStorage.removeItem(TOKEN_KEY);
    try { sessionStorage.removeItem(USER_CACHE_KEY); } catch (_) {}
    store.setState({ token: '', user: null });
  }
}

/**
 * Get cached user display name
 */
export function getCachedUserName() {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Date.now() - data.t < 30 * 60 * 1000) return data.name;
    }
  } catch (_) {}
  return null;
}

/**
 * Make an authenticated API call
 */
export async function apiCall(path, opts = {}) {
  const url = API_BASE + path;
  const token = getToken();
  const headers = {
    'Accept': 'application/json',
    ...(opts.headers || {})
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  try {
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401 || res.status === 403) {
      const isLoginApi = path.includes('/auth/login');
      if (isLoginApi) {
        let detail = 'Invalid credentials';
        try { const j = await res.json(); detail = j.detail || detail; } catch (_) {}
        throw new Error(detail);
      }
      // Token expired
      setToken('');
      throw new Error('Session expired. Please log in again.');
    }
    return res;
  } catch (e) {
    if (e.message && e.message.includes('Failed to fetch')) {
      throw new Error('Network error — cannot reach server. Local mode still works.');
    }
    throw e;
  }
}

/**
 * Login with username/email + password
 */
export async function login(username, password, remember) {
  const form = new URLSearchParams();
  form.append('username', username);
  form.append('password', password);
  if (remember) form.append('remember_me', 'true');

  const res = await apiCall('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });

  if (!res.ok) {
    let detail = 'Login failed';
    try { const j = await res.json(); detail = j.detail || detail; } catch (_) {}
    throw new Error(detail);
  }

  const data = await res.json();
  const token = data.access_token || data.token || '';
  if (!token) throw new Error('No token in server response');

  setToken(token, data.user || { username });
  return data;
}

/**
 * Register a new account
 */
export async function register(username, nickname, password) {
  const res = await apiCall('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, nickname: nickname || username, password })
  });

  if (!res.ok) {
    let detail = 'Registration failed';
    try { const j = await res.json(); detail = j.detail || detail; } catch (_) {}
    throw new Error(detail);
  }

  const data = await res.json();
  const token = data.access_token || data.token || '';
  if (token) setToken(token, data.user || { username, nickname });

  return data;
}

/**
 * Logout
 */
export function logout() {
  setToken('');
  showToast('Logged out — local mode still available', 'info');
}

/**
 * Check if user is logged in
 */
export function isLoggedIn() {
  return !!getToken();
}

/**
 * Initialize auth state from existing token
 */
export function initAuth() {
  initApiBase();
  const token = getToken();
  if (token) {
    const name = getCachedUserName();
    store.setState({ token, user: name ? { username: name, nickname: name } : null });
  }
}

export { API_BASE };
