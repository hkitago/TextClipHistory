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
      text: text,
      pinned: false
    };

    const filteredHistory = history.filter(item => item.text !== text);
    
    const updatedHistory = [
      newEntry,
      ...filteredHistory
    ];

    await browser.storage.local.set({ history: updatedHistory });
  } catch (error) {
    console.error('Failed to save to history:', error);
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
    console.error('Failed to toggle pin:', error);
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
    console.error('Failed to initialize tabs:', error);
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
      console.warn(`Failed to set icon for tab ${tabId}:`, error);
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
  if (message.request === 'saveClipboard') {
    saveToHistory(message.text);
  }

  if (message.request === 'togglePin') {
    togglePin(message.id);
  }

  if (message.request === 'checkStorage') {
    const hasHistory = await hasHistoryStorage();
    sendResponse({ hasHistory });
    
    return true;
  }

  return false;
});
