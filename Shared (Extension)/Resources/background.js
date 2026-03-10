import { settings, platformInfo } from './utils.js';

const INPUT_SOURCE_CACHE_TTL_MS = 1000;
let cachedInputSource = null;
let cachedInputSourceAt = 0;

// Get input source from native app (macOS only)
const getInputSource = async () => {
  if (!platformInfo.isMacOS) return;

  return new Promise((resolve, reject) => {
    browser.runtime.sendNativeMessage(
      'application.id',
      { message: 'getInputSource' },
      (response) => {
        if (browser.runtime.lastError) {
          reject(new Error(browser.runtime.lastError.message));
          return;
        }

        if (response && response.status === 'success') {
          resolve(response.inputSource);
        } else {
          console.error('[TextClipHistoryExtension] Failed to retrieve input source:', response);
          reject(new Error(response?.error || '[TextClipHistoryExtension] Native App response error'));
        }
      }
    );
  });
};

const getCachedInputSource = async () => {
  const now = Date.now();
  if (cachedInputSource && (now - cachedInputSourceAt) < INPUT_SOURCE_CACHE_TTL_MS) {
    return cachedInputSource;
  }

  const inputSource = await getInputSource();
  cachedInputSource = inputSource ?? null;
  cachedInputSourceAt = now;
  return inputSource;
};

const updateInputSourceStorage = async () => {
  try {
    const inputSource = await getCachedInputSource();

    const isEnabled = inputSource && !inputSource.isSingleInputSource;
    await browser.storage.local.set({ inputSourceEnabled: isEnabled });
  } catch (error) {
    console.error('[TextClipHistoryExtension] Failed to update storage:', error);
  }
};

const togglePin = async (id) => {
  try {
    const { history = [] } = await browser.storage.local.get('history');

    const updatedHistory = history.map(item =>
      item.id === id ? { ...item, pinned: !item.pinned } : item
    );

    await browser.storage.local.set({ history: updatedHistory });
  } catch (error) {
    console.error('[TextClipHistoryExtension] Failed to toggle pin:', error);
  }
};

// Checking Storage
const hasHistoryStorage = async () => {
  const { history = [] } = await browser.storage.local.get('history');
  return history.length > 0;
};

// ========================================
// Icon Handlings
// ========================================
const updateToolbarIcon = async (tabId = null) => {
  const hasHistory = await hasHistoryStorage();

  let iconPath;
  if (hasHistory) {
    iconPath = `./images/toolbar-icon.svg`;
  } else {
    iconPath = './images/toolbar-icon-off.svg';
  }

  if (tabId === null) {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = activeTab?.id;
  }

  browser.action.setIcon({ path: iconPath, tabId });
};

// ========================================
// Event Listeners
// ========================================
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    await updateToolbarIcon(tabId);
  }
});

browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  
  updateInputSourceStorage();
  await updateToolbarIcon();
});

browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && changes.history) {
    await updateToolbarIcon();
  }
});

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_CONFIG') {
    sendResponse({ config: settings.get() });
    return true;
  }

  if (message.request === 'TOGGLE_PIN') {
    togglePin(message.id);
    return false;
  }

  if (message.request === 'INPUT_FOCUSED') {
    (async () => {
      if (!platformInfo.isMacOS) return;

      const storage = await browser.storage.local.get('inputSourceEnabled');
      if (storage.inputSourceEnabled === false) return;

      let showInputSource = settings.get('showInputSource');
      if (!showInputSource) return;

      try {
        const inputSource = await getCachedInputSource();

        if (!inputSource || !sender.tab || !sender.tab.id) return;
        if (inputSource.isSingleInputSource) return;

        browser.tabs.sendMessage(sender.tab.id, {
          request: 'SHOW_INPUT_SOURCE',
          inputSource: inputSource
        });
      } catch (error) {
        console.error('[TextClipHistoryExtension] Failed to show input source on input focus:', error);
      }
    })();
    return false;
  }

  if (message.action === 'UPDATE_ICON') {
    updateToolbarIcon(sender.tab?.id);
    return false;
  }

  return false;
});

// ========================================
// Initialization
// ========================================
(async () => {
  try {
    await settings.load();
    await updateToolbarIcon();
  } catch (error) {
    console.error('[TextClipHistoryExtension] Failed to initialize:', error);
  }
})();
