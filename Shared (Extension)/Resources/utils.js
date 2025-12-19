//
//  utils.js
//  TextClipHistory
//
//  Created by Hiroyuki KITAGO on 2025/11/14.
//
export const isIOS = () => {
  return /iPhone|iPod/.test(navigator.userAgent);
};

export const isIPadOS = () => {
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
};

export const isMacOS = () => {
  return navigator.platform.includes('Mac') && !isIPadOS();
};

export const getIOSMajorVersion = () => {
  const match = navigator.userAgent.match(/OS (\d+)_/);
  return match ? parseInt(match[1], 10) : 0;
};

export const applyPlatformClass = () => {
  const body = document.body;

  if (isIOS()) {
    body.classList.add('os-ios');
  } else if (isIPadOS()) {
    body.classList.add('os-ipados');
  } else if (isMacOS()) {
    body.classList.add('os-macos');
  }
};

export const settings = (() => {
  const DEFAULT_SETTINGS = {
    clearOption: 'all',
    showInputSource: true,
  };

  let cache = { ...DEFAULT_SETTINGS };

  const load = async () => {
    try {
      const { settings: stored } = await browser.storage.local.get('settings');
      cache = { ...DEFAULT_SETTINGS, ...stored };
    } catch (error) {
      console.error('[TextClipHistoryExtension] Failed to load settings:', error);
    }
  };

  const get = (key) => cache[key];

  const set = async (key, value) => {
    cache[key] = value;
    try {
      await browser.storage.local.set({ settings: cache });
    } catch (error) {
      console.error('[TextClipHistoryExtension] Failed to save settings:', error);
    }
  };

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      cache = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    }
  });

  return { load, get, set };
})();
