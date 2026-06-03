/* ===== i18n 多语言翻译系统 =====
   支持中文 (zh) 和英文 (en)，默认中文
   用法: t('compress.title') 或 t('compress.drag_text')
*/
const TRANSLATIONS = {
  zh: {
    // App shell
    app: {
      title: 'ImageCompress 赛博朋克版',
      subtitle: '图片处理工具箱',
      login_required: '请先登录',
      login: '登录',
      register: '注册',
      logout: '退出',
      username: '用户名',
      password: '密码',
      nickname: '昵称',
      email: '邮箱',
      send_code: '发送验证码',
      code_placeholder: '输入验证码',
      login_success: '登录成功',
      register_success: '注册成功',
      logout_success: '已退出登录',
      session_expired: '会话已过期，请重新登录',
      unchecked: '未检查',
      checking: '检查中...',
    },
    // Navigation
    nav: {
      compress: '压缩',
      watermark: '去水印',
      background: '换背景',
      about: '关于',
      online_version: '在线版本',
      check_update: '检查更新',
      language: '语言',
    },
    // Compress page
    compress: {
      title: '图片压缩',
      drag_text: '拖拽图片到此处',
      browse: '选择文件',
      add_more: '添加更多',
      queue: '压缩队列',
      settings: '压缩设置',
      format: '输出格式',
      quality: '压缩质量',
      max_width: '最大宽度',
      max_height: '最大高度',
      concurrency: '并发数',
      advanced_settings: '高级设置',
      hide_advanced: '隐藏高级设置',
      show_advanced: '显示更多设置',
      start: '开始压缩',
      download_all: '下载全部',
      clear: '清空',
      compressed: '压缩后',
      original: '原始',
      saved: '节省',
      no_files: '暂无文件',
      processing: '处理中...',
      done: '完成',
      error: '失败',
      total_saved: '总共节省',
    },
    // Watermark page
    watermark: {
      title: '去水印',
      select_image: '选择图片',
      select_area: '框选水印区域',
      clear_selection: '清除选区',
      iterations: '迭代次数',
      mode: '填充模式',
      mode_smooth: '平滑填充',
      mode_edge: '边缘保留',
      processing: '处理中...',
      process: '开始去水印',
      download: '下载结果',
      elapsed: '处理耗时',
      source: '原图',
      result: '结果',
      tip_mobile: '移动端暂不支持框选，请使用桌面端',
    },
    // Background page
    background: {
      title: '证件照换底色',
      select_image: '选择图片',
      color_picker: '选择颜色',
      custom_color: '自定义',
      red: '红色',
      blue: '蓝色',
      white: '白色',
      tolerance: '容差',
      feather: '羽化',
      shrink: '收缩',
      size_preset: '尺寸预设',
      original_size: '原始',
      inch1: '1 英寸',
      inch2: '2 英寸',
      process: '换底色',
      download: '下载结果',
      source: '原图',
      result: '结果',
      picker_tip: '点击取色',
    },
    // About page
    about: {
      title: '关于',
      version: '版本',
      build_date: '构建日期',
      description: 'ImageCompress 赛博朋克版 — 图片压缩、去水印、证件照换底色，100% 本地浏览器处理，保护隐私安全。',
      features: '功能特性',
      feature1: '智能压缩：支持 JPG/PNG/WebP 互转，多文件并发处理',
      feature2: 'AI 去水印：框选水印区域，智能修复填充',
      feature3: '证件照：一键替换红/蓝/白底色，支持标准尺寸',
      feature4: '离线可用：PWA 支持，无需网络也能使用',
      privacy: '隐私说明',
      privacy_text: '所有图片处理在本地完成，不会上传任何数据到服务器。应用仅在进行账号登录时连接服务器进行身份验证。',
      shortcuts: '快捷键',
      shortcut_c: '切换到',
      language: '语言设置',
      check_update_btn: '检查更新',
      latest_version: '已是最新版本',
      new_version: '发现新版本',
    },
    // Updater
    updater: {
      title: '发现新版本',
      current_version: '当前版本',
      latest_version: '最新版本',
      download_btn: '查看下载页面',
      direct_download: '直接下载文件',
      remind_later: '稍后提醒',
      view_changelog: '查看更新日志 →',
      no_update: '已是最新版本',
      check_failed: '检查更新失败，服务器不可达',
      checking: '检查中...',
      checked_recently: '刚刚检查过，请稍后再试',
    },
    // Toast
    toast: {
      success: '成功',
      error: '错误',
      info: '提示',
      copied: '已复制',
      network_error: '网络错误，请检查连接',
    },
    // Auth
    auth: {
      login_title: '登录',
      register_title: '注册',
      switch_to_login: '已有账号？登录',
      switch_to_register: '没有账号？注册',
      username_placeholder: '请输入用户名',
      password_placeholder: '请输入密码',
      email_placeholder: '请输入邮箱',
      code_sent: '验证码已发送',
      code_send_failed: '发送验证码失败',
      login_failed: '登录失败',
      register_failed: '注册失败',
      logged_in_as: '已登录',
    },
  },

  en: {
    app: {
      title: 'ImageCompress Cyberpunk Edition',
      subtitle: 'Image Processing Toolbox',
      login_required: 'Login required',
      login: 'Login',
      register: 'Register',
      logout: 'Logout',
      username: 'Username',
      password: 'Password',
      nickname: 'Nickname',
      email: 'Email',
      send_code: 'Send Code',
      code_placeholder: 'Enter code',
      login_success: 'Login successful',
      register_success: 'Registration successful',
      logout_success: 'Logged out',
      session_expired: 'Session expired, please login again',
      unchecked: 'Not checked',
      checking: 'Checking...',
    },
    nav: {
      compress: 'Compress',
      watermark: 'De-Watermark',
      background: 'BG Change',
      about: 'About',
      online_version: 'Online Version',
      check_update: 'Check Update',
      language: 'Language',
    },
    compress: {
      title: 'Image Compression',
      drag_text: 'Drag images here',
      browse: 'Browse Files',
      add_more: 'Add More',
      queue: 'Compression Queue',
      settings: 'Settings',
      format: 'Output Format',
      quality: 'Quality',
      max_width: 'Max Width',
      max_height: 'Max Height',
      concurrency: 'Concurrency',
      advanced_settings: 'Advanced Settings',
      hide_advanced: 'Hide Advanced',
      show_advanced: 'Show More Settings',
      start: 'Start Compression',
      download_all: 'Download All',
      clear: 'Clear',
      compressed: 'Compressed',
      original: 'Original',
      saved: 'Saved',
      no_files: 'No files',
      processing: 'Processing...',
      done: 'Done',
      error: 'Error',
      total_saved: 'Total Saved',
    },
    watermark: {
      title: 'De-Watermark',
      select_image: 'Select Image',
      select_area: 'Select watermark area',
      clear_selection: 'Clear Selection',
      iterations: 'Iterations',
      mode: 'Fill Mode',
      mode_smooth: 'Smooth Fill',
      mode_edge: 'Edge Preserve',
      processing: 'Processing...',
      process: 'Remove Watermark',
      download: 'Download Result',
      elapsed: 'Elapsed Time',
      source: 'Source',
      result: 'Result',
      tip_mobile: 'Selection not supported on mobile, please use desktop',
    },
    background: {
      title: 'Background Change',
      select_image: 'Select Image',
      color_picker: 'Pick Color',
      custom_color: 'Custom',
      red: 'Red',
      blue: 'Blue',
      white: 'White',
      tolerance: 'Tolerance',
      feather: 'Feather',
      shrink: 'Shrink',
      size_preset: 'Size Preset',
      original_size: 'Original',
      inch1: '1 inch',
      inch2: '2 inch',
      process: 'Change Background',
      download: 'Download Result',
      source: 'Source',
      result: 'Result',
      picker_tip: 'Click to pick',
    },
    about: {
      title: 'About',
      version: 'Version',
      build_date: 'Build Date',
      description: 'ImageCompress Cyberpunk Edition — Image compression, watermark removal, background change. 100% local browser processing for privacy.',
      features: 'Features',
      feature1: 'Smart Compression: JPG/PNG/WebP conversion, multi-file concurrent processing',
      feature2: 'AI De-Watermark: Select watermark area, smart inpainting',
      feature3: 'ID Photo: One-click background replacement (red/blue/white), standard sizes',
      feature4: 'Offline Ready: PWA support, works without internet',
      privacy: 'Privacy',
      privacy_text: 'All image processing is done locally. No data is ever uploaded to any server. The app only connects to the server for account authentication.',
      shortcuts: 'Shortcuts',
      shortcut_c: 'Switch to',
      language: 'Language',
      check_update_btn: 'Check Update',
      latest_version: 'You are up to date',
      new_version: 'New version available',
    },
    updater: {
      title: 'Update Available',
      current_version: 'Current',
      latest_version: 'Latest',
      download_btn: 'Go to Download Page',
      direct_download: 'Direct Download',
      remind_later: 'Remind Later',
      view_changelog: 'View Changelog →',
      no_update: 'You are running the latest version',
      check_failed: 'Failed to check for updates. Server unreachable.',
      checking: 'Checking...',
      checked_recently: 'Checked recently. Please wait before checking again.',
    },
    toast: {
      success: 'Success',
      error: 'Error',
      info: 'Info',
      copied: 'Copied',
      network_error: 'Network error, please check connection',
    },
    auth: {
      login_title: 'Login',
      register_title: 'Register',
      switch_to_login: 'Have an account? Login',
      switch_to_register: 'No account? Register',
      username_placeholder: 'Enter username',
      password_placeholder: 'Enter password',
      email_placeholder: 'Enter email',
      code_sent: 'Verification code sent',
      code_send_failed: 'Failed to send code',
      login_failed: 'Login failed',
      register_failed: 'Registration failed',
      logged_in_as: 'Logged in as',
    },
  }
};

// Current language
let currentLang = localStorage.getItem('app_lang') || 'zh';

/**
 * Get translation for a key
 * @param {string} key - dot-separated key like 'compress.title'
 * @param {object} [params] - optional interpolation params
 * @returns {string}
 */
export function t(key, params = {}) {
  const keys = key.split('.');
  let value = TRANSLATIONS[currentLang];
  for (const k of keys) {
    if (!value) return key;
    value = value[k];
  }
  if (!value && currentLang === 'en') {
    // Fallback to Chinese
    value = TRANSLATIONS['zh'];
    for (const k of keys) {
      if (!value) return key;
      value = value[k];
    }
  }
  if (!value) return key;
  // Simple interpolation: {key} -> params[key]
  if (typeof value === 'string' && params) {
    return value.replace(/\{(\w+)\}/g, (_, k) => params[k] !== undefined ? params[k] : `{${k}}`);
  }
  return value;
}

/**
 * Get current language code
 * @returns {string} 'zh' | 'en'
 */
export function getLang() {
  return currentLang;
}

/**
 * Set language and update UI
 * @param {string} lang - 'zh' or 'en'
 */
export function setLang(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  currentLang = lang;
  localStorage.setItem('app_lang', lang);
  // Dispatch event for components to update
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  // Also update HTML lang attribute for accessibility
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

/**
 * Toggle between zh and en
 */
export function toggleLang() {
  setLang(currentLang === 'zh' ? 'en' : 'zh');
}

/**
 * Initialize i18n - set html lang attribute
 */
export function initI18n() {
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
}

export { currentLang };
