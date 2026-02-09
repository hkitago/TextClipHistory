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

export const sendMessageSafe = async (tabId, message) => {
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Ignore errors if the content script is not yet loaded or the tab is not accessible.
    console.warn('[TextClipHistoryExtension] Failed to send message to content.js:', error);
  }
};

export const settings = (() => {
  const DEFAULT_SETTINGS = {
    clearOption: 'all',
    showClipboardPreview: false,
    showInputSource: false,
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

  const get = (key) => {
    if (key === undefined) return { ...cache };
    return cache[key];
  };

  const set = async (key, value) => {
    cache[key] = value;
    try {
      await browser.storage.local.set({ settings: cache });
    } catch (error) {
      console.error('[TextClipHistoryExtension] Failed to save settings:', error);
    }
  };

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes.settings) {
      cache = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    }
  });

  return { load, get, set };
})();
