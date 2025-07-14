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

// Update icon logic
const updateIcon = (iconState) => {
  let iconPath;
  switch (iconState) {
    case 'extension-on':
      iconPath = 'images/toolbar-icon-on.svg';
      break;
    default:
      iconPath = 'images/toolbar-icon.svg';
      break;
  }
  browser.action.setIcon({ path: iconPath });
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

const initToolbarIcon = async () =>{
  const hasHistory = await hasHistoryStorage();

  if (hasHistory) {
    updateIcon('extension-on');
  } else {
    updateIcon('default');
  }
};

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

  if (message.request === 'initToolbarIcon') {
    initToolbarIcon();
  }

  return false;
});

browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local' && changes.history) {
    initToolbarIcon();
  }
});
