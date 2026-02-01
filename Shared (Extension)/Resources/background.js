import { isMacOS, settings } from './utils.js';

await settings.load();

// Get input source from native app (macOS only)
const getInputSource = async () => {
  if (!isMacOS()) return;

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

const updateInputSourceStorage = async () => {
  try {
    const inputSource = await getInputSource();

    const isEnabled = inputSource && !inputSource.isSingleInputSource;
    await browser.storage.local.set({ inputSourceEnabled: isEnabled });
  } catch (error) {
    console.error('[TextClipHistoryExtension] Failed to update storage:', error);
  }
};

browser.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== browser.windows.WINDOW_ID_NONE) {
    updateInputSourceStorage();
    initToolbarIcon();
  }
});

// When enabled with tabs already open, just tricky part for Safari
browser.runtime.onInstalled.addListener(async () => {
  const tabs = await browser.tabs.query({});

  for (const tab of tabs) {
    if (tab.url.startsWith('http') || tab.url.startsWith('https')) {
      await browser.tabs.reload(tab.id);
    }
  }
});

// UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const saveToHistory = async (text) => {
  try {
    const { history = [] } = await browser.storage.local.get('history');

    const newEntry = {
      id: generateUUID(),
      text,
      pinned: false
    };

    const updatedHistory = [
      newEntry,
      ...history
    ];

    await browser.storage.local.set({ history: updatedHistory });

  } catch (error) {
    console.error('[TextClipHistoryExtension] Failed to save to history:', error);
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

// Icon Handlings
const activeTabs = new Set();

const getAllTabIds = async () => {
  try {
    const tabs = await browser.tabs.query({});
    tabs.forEach(tab => activeTabs.add(tab.id));
  } catch (error) {
    console.error('[TextClipHistoryExtension] Failed to initialize tabs:', error);
  }
};

const setIconForAllTabs = async (iconPath) => {
  if (activeTabs.size === 0) {
    await getAllTabIds();
  }
  
  const promises = Array.from(activeTabs).map(async (tabId) => {
    try {
      await browser.action.setIcon({
        path: iconPath,
        tabId: tabId
      });
    } catch (error) {
      console.warn(`[TextClipHistoryExtension] Failed to set icon for tab ${tabId}:`, error);
      activeTabs.delete(tabId);
    }
  });
  
  await Promise.all(promises);
};

const updateIcon = (iconState, tabId = null) => {
  const iconPath = iconState === 'extension-on'
    ? 'images/toolbar-icon-on.svg'
    : 'images/toolbar-icon.svg';

  if (tabId === null) {
    setIconForAllTabs(iconPath);
  } else {
    browser.action.setIcon({ path: iconPath, tabId: tabId });
  }
};

const initToolbarIcon = async (tabId = null) => {
  const hasHistory = await hasHistoryStorage();

  if (hasHistory) {
    updateIcon('extension-on', tabId);
  } else {
    updateIcon('default', tabId);
  }
};

browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && changes.history) {
    initToolbarIcon();
  }
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  activeTabs.add(tab.id);

  if (changeInfo.status === 'complete') {
    initToolbarIcon(tabId);
  }
});

browser.tabs.onCreated.addListener(async (tab) => {
  // Prevent duplicate event handling
  if (tab.index === 0) return; // for itself
  if (Number.isNaN(tab.index)) return; // for iOS/iPadOS

  initToolbarIcon(tab.id);
});

browser.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});

// Get Message Listeners
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_CONFIG') {
    sendResponse({ config: settings.get() });
    return true;
  }

  if (message.request === 'SAVE_CLIPBOARD') {
    saveToHistory(message.text);
  }

  if (message.request === 'TOGGLE_PIN') {
    togglePin(message.id);
  }

  if (message.request === 'INPUT_FOCUSED') {
    (async () => {
      if (!isMacOS()) return;

      const storage = await browser.storage.local.get('inputSourceEnabled');
      if (storage.inputSourceEnabled === false) return;

      let showInputSource = settings.get('showInputSource');
      if (!showInputSource) return;

      try {
        const inputSource = await getInputSource();

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
  }

  return false;
});
