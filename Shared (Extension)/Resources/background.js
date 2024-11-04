// When enabled with tabs already open, just tricky part for Safari
browser.runtime.onInstalled.addListener(async () => {
  const tabs = await browser.tabs.query({});

  for (const tab of tabs) {
    if (tab.url.startsWith('http') || tab.url.startsWith('https')) {
      await browser.tabs.reload(tab.id);
    }
  }
});

// UUID生成関数
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const MAX_HISTORY_SIZE = 10;

const saveToHistory = async (text) => {
  try {
    const { history = [] } = await browser.storage.local.get('history');

    // 新しい履歴項目を作成（ID付き）
    const newEntry = { id: generateUUID(), text, pinned: false };

    // 既存の履歴を更新
    const updatedHistory = [
      newEntry,
      ...history.filter(item => item.text !== text)
    ]
    .filter((item, index, self) => item.pinned || self.findIndex(h => h.text === item.text) === index)
    .slice(0, MAX_HISTORY_SIZE);

    await browser.storage.local.set({ history: updatedHistory });

    updateIcon('extension-on');
  } catch (error) {
    console.error('Failed to save to history:', error);
  }
};

// ピン留めのトグルをIDで処理
/*
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
 */

// Update icon logic
const updateIcon = (iconState) => {
  let iconPath;
  switch (iconState) {
    case "extension-on":
      iconPath = "images/toolbar-icon-on.svg";
      break;
    default:
      iconPath = "images/toolbar-icon.svg";
      break;
  }
  //console.log('updateIcon:', iconState);
  browser.action.setIcon({ path: iconPath });
};

// ツールバーのボタンがクリックされた際に実行
browser.action.onClicked.addListener(async (tab) => {
  const hasHistory = await checkHistoryStorage();
  browser.tabs.sendMessage(tab.id, { request: "checkStorage", hasHistory });
});

// ストレージのデータを確認し、空かどうかを返す関数
const checkHistoryStorage = async () => {
  const { history = [] } = await browser.storage.local.get('history');
  return history.length > 0;
};

// リスナーでメッセージを受け取って処理
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  //console.log('background:', message.request);
  
  if (message.request === "checkStorage") {
    const hasHistory = await checkHistoryStorage();
    sendResponse({ hasHistory });
    return true;
  }

  if (message.request === "updateIcon") {
    updateIcon(message.iconState);
  }

  if (message.request === "saveClipboard") {
    saveToHistory(message.text);
  }
/*
 if (message.request === "togglePin") {
   togglePin(message.id);
 }
 */

  return false;
});

