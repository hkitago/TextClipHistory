//
//  popup.js
//  TextClipHistory
//
//  Created by Hiroyuki KITAGO on 2024/11/01.
//

import { labelStrings, getCurrentLangCode } from './localization.js';
const langCode = getCurrentLangCode();

const getiOSVersion = () => {
  return parseInt((navigator.userAgent.match(/OS (\d+)_/) || [])[1] || 0);
};

const closeWindow = () => {
  window.close();
  
  if (getiOSVersion() < 18) {
    setTimeout(() => {
      browser.runtime.reload();
    }, 100);
  }
};

/* Global variables */
const DISPLAY_LIMIT = 10;

const closeWindowTime = 1500;
let closeTimeout;

const idleWindowTime = 3 * 60 * 1000;
let idleTimeout;
let lastMousePosition = { x: 0, y: 0 };

/* Init for auto-close */
const initPage = () => {
  browser.runtime.sendMessage({ request: 'checkStorage' }).then((response) => {
    if (!response.hasHistory) {
      setTimeout(() => {
        closeWindow();
      }, closeWindowTime);
    }
  }).catch(error => {
    console.error('Failed to check storage:', error);
  });
};

// Init with tricky part https://developer.apple.com/forums/thread/651215
if (document.readyState !== 'loading') {
  initPage();
} else {
  document.addEventListener('DOMContentLoaded', initPage);
}

/* Rendering */
document.addEventListener('DOMContentLoaded', async () => {
  if (navigator.userAgent.indexOf('iPhone') > -1) {
    document.body.style.width = 'initial';
  }

  if (langCode.substring(0, 2) === 'ar' || langCode.substring(0, 2) === 'he') {
    document.body.classList.add('rtl');
    document.documentElement.setAttribute('lang', langCode.substring(0, 2));
    document.documentElement.setAttribute('dir', 'rtl');
  }

  document.body.addEventListener('mouseleave', () => {
    closeTimeout = setTimeout(() => {
      closeWindow();
    }, closeWindowTime);
  });

  document.body.addEventListener('mouseenter', () => {
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
  });

  document.body.addEventListener('mousemove', (event) => {
    const currentPosition = { x: event.clientX, y: event.clientY };
    
    if (currentPosition.x !== lastMousePosition.x || currentPosition.y !== lastMousePosition.y) {
      lastMousePosition = currentPosition;

      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }

      idleTimeout = setTimeout(() => {
        closeWindow();
      }, idleWindowTime);
    }
  });

  const header = document.querySelector('header');
  const main = document.querySelector('main');
  const footer = document.querySelector('footer');

  const clearAllHistory = document.getElementById('clearAllHistory');
  const editActions = document.getElementById('editActions');
  const editDone = document.getElementById('editDone');

  const initializePopupPage = () => {
    header.style.display = 'none';
    main.innerHTML = `<div><p>${labelStrings[langCode].onError}</p></div>`;
    footer.style.display = 'none';
  };

  const { history = [] } = await browser.storage.local.get('history');

  if (history.length === 0) {
    initializePopupPage();
    return;
  }

  const pinnedItems = history.filter(item => item.pinned);
  const unpinnedItems = history.filter(item => !item.pinned);

  const sortedHistory = [
    ...pinnedItems.slice(0, DISPLAY_LIMIT),
    ...unpinnedItems.slice(0, Math.max(0, DISPLAY_LIMIT - pinnedItems.length))
  ];
  
  /* rendering Main List */
  const ul = document.createElement('ul');
  const pinIcons = { 'on': './images/icon-pin-on.svg', 'off': './images/icon-pin-off.svg'};
  
  const createListItem = (item) => {
    const li = document.createElement('li');
    const div = document.createElement('div');
    
    div.textContent = item.text;

    const icon = document.createElement('img');
    icon.src = item.pinned ? pinIcons.on : pinIcons.off;

    icon.addEventListener('click', async (event) => {
      event.stopPropagation();

      const itemId = li.dataset.id;

      await browser.runtime.sendMessage({
        request: 'togglePin',
        id: itemId
      });

      if (li.dataset.pinned === 'false') { /* Pinned */
        const pinnedItems = Array.from(
          document.querySelectorAll(".history-item[data-pinned='true']")
        );

        const currentPinnedIndexes = pinnedItems.map((el) =>
          history.findIndex((h) => h.id === el.dataset.id)
        );
        const currentItemIndex = history.findIndex((h) => h.id === item.id);

        const insertIndex = currentPinnedIndexes.findIndex(
          (index) => index > currentItemIndex
        );

        if (insertIndex === -1) {
          const lastPinnedItem = pinnedItems[pinnedItems.length - 1];
          if (lastPinnedItem) {
            lastPinnedItem.after(li);
          } else {
            const ul = document.querySelector('ul');
            ul.prepend(li);
          }
        } else {
          const targetItem = pinnedItems[insertIndex];
          targetItem.before(li);
        }

        li.dataset.pinned = 'true';
        icon.src = pinIcons.on;
      } else { /* Un-Pinned */
        const targetHistoryItem = history.find(h => h.id === item.id);
        if (targetHistoryItem) {
          targetHistoryItem.pinned = false;
        }

        const pinnedItems = history.filter((h) => h.pinned);
        const unpinnedItems = history.filter((h) => !h.pinned);

        const sortedHistory = [
          ...pinnedItems.slice(0, DISPLAY_LIMIT),
          ...unpinnedItems.slice(0, Math.max(0, DISPLAY_LIMIT - pinnedItems.length)),
        ];

        const willBeVisible = sortedHistory.some(h => h.id === item.id);

        if (!willBeVisible) {
          li.remove();
          const nextVisibleItem = unpinnedItems[DISPLAY_LIMIT - pinnedItems.length - 1];
          if (nextVisibleItem) {
            createListItem(nextVisibleItem);
          }
        } else {
          const ul = document.querySelector('ul');

          const referenceItem = Array.from(ul.children).find(child => {
            const childId = child.dataset.id;
            const childIndex = history.findIndex(h => h.id === childId);
            const itemIndex = history.findIndex(h => h.id === item.id);
            return childIndex > itemIndex && child.dataset.id !== item.id;
          });

          if (referenceItem) {
            referenceItem.before(li);
          } else {
            ul.appendChild(li);
          }
        }

        li.dataset.pinned = 'false';
        icon.src = pinIcons.off;
      }
    });

    li.appendChild(div);
    li.appendChild(icon);
    li.classList.add('history-item');
    li.dataset.id = item.id;
    li.dataset.pinned = item.pinned;

    li.addEventListener('click', async (event) => {
      const textToCopy = item.text;
      await navigator.clipboard.writeText(textToCopy);
      
      // send msg to content.js
      browser.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        await browser.tabs.sendMessage(tabs[0].id, {
          request: "pasteText",
          text: textToCopy
        });
      });
      
      closeWindow();
    });

    ul.appendChild(li);
  };
  
  sortedHistory.forEach(item => {
    createListItem(item);
  });

  main.appendChild(ul);

  /* rendering Clear All History */
  clearAllHistory.textContent = labelStrings[langCode].clearAllHistory;
  clearAllHistory.addEventListener('click', async () => {
    try {
      await browser.storage.local.clear();
      initializePopupPage();
      browser.runtime.sendMessage({ request: "updateIcon", iconState: "default" });
      setTimeout(() => {
        closeWindow();
      }, closeWindowTime);

    } catch (error) {
      console.error('Failed to clear text clippings:', error);
    }
  });

  editActions.style.display = 'none';
  editDone.style.display = 'none';
});
