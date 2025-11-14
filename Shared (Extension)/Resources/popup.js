//
//  popup.js
//  TextClipHistory
//
//  Created by Hiroyuki KITAGO on 2024/11/01.
//
import { getCurrentLangLabelString, applyRTLSupport } from './localization.js';
import { isIOS, isIPadOS, isMacOS, getIOSMajorVersion, applyPlatformClass } from './utils.js';

const appState = {
  isEditMode: false,
};

const getState = (key) => {
  return appState[key];
};

const setState = (key, value) => {
  appState[key] = value;
};

const closeWindow = () => {
  window.close();

  // In older iOS versions (<18), reloading the extension helped with some popup issues
  // Might no longer be necessary — safe to remove if no issues found
  if (getIOSMajorVersion() > 0 && getIOSMajorVersion() < 18) {
    setTimeout(() => {
      try {
        browser.runtime.reload();
      } catch (error) {
        console.warn('[QuoteLinkExtension] browser.runtime.reload failed:', error);
      }
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

const DEFAULT_SETTINGS = {
  clearOption: 'all'
};

const getSettings = async () => {
  try {
    const { settings } = await browser.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    console.error('Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
};

/* Init for auto-close */
const autoClosePage = () => {
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

const toggleEditMode = () => {
  setState('isEditMode', !getState('isEditMode'));
  const header = document.querySelector('header');
  const ul = document.getElementById('historyList');

  if (getState('isEditMode')) {
    header.style.display = 'flex';
    ul.classList.add('isEditMode');
    editActions.style.display = 'none';
    editDone.style.display = 'block';
  } else {
    header.style.display = 'none';
    ul.classList.remove('isEditMode');
    editActions.style.display = 'block';
    editDone.style.display = 'none';
  }
};

const onMouseOver = (event) => {
  event.target.closest('li').classList.add('hover');
}

const onMouseOut = (event) => {
  event.target.closest('li').classList.remove('hover');
}

const buildPopup = async (url, color, sortedIds) => {
  applyPlatformClass();
  applyRTLSupport();

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

  const historyOptions = document.getElementById('history-options');
  const allHistory = document.getElementById('allHistory');
  const keepPinned = document.getElementById('keepPinned');
  const clearAllHistory = document.getElementById('clearAllHistory');
  const editActions = document.getElementById('editActions');
  const editDone = document.getElementById('editDone');

  const initializePopupPage = async () => {
    header.style.display = 'none';
    main.innerHTML = `<div><p>${getCurrentLangLabelString('onError')}</p></div>`;
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
  ul.id = 'historyList';
  const copyIcons = { 'on': './images/icon-copy-on.svg', 'off': './images/icon-copy-off.svg'};
  const pinIcons = { 'on': './images/icon-pin-on.svg', 'off': './images/icon-pin-off.svg'};

  const createListItem = (item) => {
    const li = document.createElement('li');
    const div = document.createElement('div');
    
    div.textContent = item.text;

    const iconCopy = document.createElement('img');
    iconCopy.src = copyIcons.off;
    iconCopy.classList.add('iconCopy');
    if (!isMacOS) {
      iconCopy.style.display = 'initial';
    }

    const iconPin = document.createElement('img');
    iconPin.src = item.pinned ? pinIcons.on : pinIcons.off;
    iconPin.classList.add('iconPin');

    iconPin.addEventListener('click', async (event) => {
      if (!getState('isEditMode') && !isMacOS()) return false;

      event.stopPropagation();

      const itemId = li.dataset.id;

      await browser.runtime.sendMessage({
        request: 'togglePin',
        id: itemId
      });

      // Moving LI-Item with Fade-Animation
      li.classList.add('fade-out');

      li.addEventListener('transitionend', (event) => {
        if (event.propertyName === 'opacity') {
          const target = event.target;

          if (target.classList.contains('fade-out')) {
            target.classList.remove('fade-out');
            
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
                  const ul = document.getElementById('historyList');
                  ul.prepend(li);
                }
              } else {
                const targetItem = pinnedItems[insertIndex];
                targetItem.before(li);
              }

              li.dataset.pinned = 'true';
              iconPin.src = pinIcons.on;
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
                const unpinnedItems = Array.from(
                  document.querySelectorAll(".history-item[data-pinned='false']")
                );
                
                const referenceItem = unpinnedItems.find(child => {
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
              iconPin.src = pinIcons.off;
            }
            li.classList.remove('hover');
            updateClearOptionsVisibility();
          }
        }
      });
    });

    li.appendChild(div);
    li.appendChild(iconPin);
    li.appendChild(iconCopy);
    li.classList.add('history-item');
    li.dataset.id = item.id;
    li.dataset.pinned = item.pinned;

    li.addEventListener('click', async (event) => {
      if (getState('isEditMode') && !isMacOS()) return false;

      const textToCopy = item.text;
      await navigator.clipboard.writeText(textToCopy);
      
      // send msg to content.js
      browser.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        await browser.tabs.sendMessage(tabs[0].id, {
          request: 'pasteText',
          langcode: langCode.substring(0, 2),
          text: textToCopy
        });
      });
      
      // animation for seeing done to copy
      event.stopPropagation();
      iconCopy.src = copyIcons.on;
      iconCopy.classList.add('fadeIn');
      setTimeout(() => {
        closeWindow();
      }, 500);
    });

    if (isMacOS()) {
      li.addEventListener('mouseover', onMouseOver);
      li.addEventListener('mouseout', onMouseOut);
    }

    li.addEventListener('touchstart', (event) => {
      if (getState('isEditMode')) return false;

      event.stopPropagation();
      event.target.closest('li').classList.add('selected');
    });
    
    li.addEventListener('touchend', (event) => {
      event.stopPropagation();
      event.target.closest('li').classList.remove('selected');
    });

    li.addEventListener('touchcancel', (event) => {
      event.stopPropagation();
      event.target.closest('li').classList.remove('selected');
    });
    
    ul.appendChild(li);
  };
  
  sortedHistory.forEach(item => {
    createListItem(item);
  });

  main.appendChild(ul);

  /* rendering header */
  if (!isMacOS()) {
    header.style.display = 'none';
  }
  
  allHistory.textContent = `${getCurrentLangLabelString('clearHistoryAll')}`;
  keepPinned.textContent = `${getCurrentLangLabelString('clearHistoryOption')}`;

  const showClearOptions = () => {
    const items = document.querySelectorAll('#historyList .history-item');
    const totalCount = items.length;

    const pinnedCount = Array.from(items).filter(
      el => el.getAttribute('data-pinned') === 'true'
    ).length;

    return pinnedCount > 0 && pinnedCount < totalCount;
  };

  const settings = await getSettings();
  let clearOption = settings.clearOption;

  const clearOptionHandlers = (option) => {
    allHistory.classList.toggle('selected', option === 'all');
    keepPinned.classList.toggle('selected', option === 'keep');

    const updatedSettings = {
      clearOption: option  /* 'all' | 'keep' */
    };

    browser.storage.local.set({ settings: updatedSettings }).catch((error) => {
      console.error('Failed to save settings:', error);
    });
    
    clearOption = option;
  };

  allHistory.addEventListener('click', () => clearOptionHandlers('all'));
  keepPinned.addEventListener('click', () => clearOptionHandlers('keep'));
  
  allHistory.classList.toggle('selected', clearOption === 'all');
  keepPinned.classList.toggle('selected', clearOption === 'keep');

  const updateClearOptionsVisibility = () => {
    historyOptions.style.display = showClearOptions() ? '' : 'none';
    clearAllHistory.textContent = showClearOptions() ? `${getCurrentLangLabelString('clearButton')}` : `${getCurrentLangLabelString('clearAllHistory')}`;
  };
  
  updateClearOptionsVisibility();
  
  clearAllHistory.addEventListener('click', async () => {
    try {
      if (showClearOptions() && clearOption === 'keep') {
        const { history = [] } = await browser.storage.local.get('history');
        const pinnedOnly = history.filter(item => item.pinned === true);
        
        if (history.length === pinnedOnly.length) return false;
        
        await browser.storage.local.remove('history');

        await browser.storage.local.set({ history: pinnedOnly });
        
        const allItems = document.querySelectorAll('ul#historyList li');
        allItems.forEach(li => {
          const isPinned = li.getAttribute('data-pinned') === 'true';
          if (!isPinned) li.remove();
        });
        
        if (pinnedOnly.length === 0) {
          initializePopupPage();
        }
      } else {
        await browser.storage.local.remove('history');
        initializePopupPage();

        setTimeout(() => {
          closeWindow();
        }, closeWindowTime);
      }

      updateClearOptionsVisibility();
    } catch (error) {
      console.error('Failed to clear text clippings:', error);
    }
  });

  if (isMacOS()) {
    clearAllHistory.addEventListener('mouseover', (event) => {
      event.target.classList.add('hover');
    });
    clearAllHistory.addEventListener('mouseout', (event) => {
      event.target.classList.remove('hover');
    });
  }

  /* rendering footer */
  if (isMacOS()) {
    footer.style.display = 'none';
  }

  editActions.textContent = `${getCurrentLangLabelString('editActions')}`;
  editActions.addEventListener('click', toggleEditMode);
  editActions.addEventListener('touchstart', (event) => {
    event.target.classList.add('selected');
  });
  editActions.addEventListener('touchend', (event) => {
    event.target.classList.remove('selected');
  });

  editDone.textContent = `${getCurrentLangLabelString('editDone')}`;
  editDone.addEventListener('click', toggleEditMode);
  editDone.addEventListener('touchstart', (event) => {
    event.target.classList.add('selected');
  });
  editDone.addEventListener('touchend', (event) => {
    event.target.classList.remove('selected');
  });
};

let isInitialized = false;

const initializePopup = async () => {
  if (isInitialized) return;
  isInitialized = true;

  try {
    autoClosePage();
    await buildPopup();
  } catch (error) {
    console.error('Fail to initialize to build the popup:', error);
    isInitialized = false;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup, { once: true });
} else {
  initializePopup();
}
