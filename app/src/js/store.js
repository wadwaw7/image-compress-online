/* ===== Simple Pub/Sub State Store ===== */

const store = {
  state: {
    currentTab: 'compress',
    // Compress tab state
    compressFiles: [],
    compressResults: [],
    compressFormat: 'webp',
    compressQuality: 80,
    compressMaxW: 0,
    compressMaxH: 0,
    compressConcurrency: 2,
    compressProgress: { done: 0, total: 0, currentName: '' },
    compressRunning: false,
    // Watermark tab state
    wmFile: null,
    wmSrcBitmap: null,
    wmSelection: null,
    wmIterations: 35,
    wmResult: null,
    wmDragging: false,
    // Background tab state
    bgFile: null,
    bgSrcBitmap: null,
    bgColor: '#ffffff',
    bgColorRGB: [255, 255, 255],
    bgTolerance: 10,
    bgFeather: 2,
    bgShrink: 0,
    bgSize: 'orig',
    bgVshift: 0,
    bgFormat: 'image/jpeg',
    bgQuality: 90,
    bgSampleMode: 'auto',
    bgManualRGB: null,
    bgResult: null
  },

  listeners: new Set(),

  setState(update) {
    Object.assign(this.state, update);
    this.listeners.forEach(fn => {
      try { fn(this.state); } catch (e) { console.error('Store listener error:', e); }
    });
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  get(key) {
    return this.state[key];
  }
};

export default store;
