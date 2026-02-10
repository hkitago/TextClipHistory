//
//  popup.js
//  TextClipHistory
//
//  Created by Hiroyuki KITAGO on 2024/11/01.
//
import { getCurrentLangLabelString, applyRTLSupport } from './localization.js';
import { isIOS, isIPadOS, isMacOS, getIOSMajorVersion, applyPlatformClass, settings } from './utils.js';

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
        console.warn('[TextClipHistoryExtension] browser.runtime.reload failed:', error);
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

const toggleEditMode = () => {
  setState('isEditMode', !getState('isEditMode'));
  const nav = document.querySelector('nav');
  const pinnedUl = document.getElementById('pinnedHistoryList');
  const unpinnedUl = document.getElementById('unpinnedHistoryList');
  
  if (getState('isEditMode')) {
    nav.style.display = 'flex';
    pinnedUl?.classList.add('isEditMode');
    unpinnedUl?.classList.add('isEditMode');
    editActions.style.display = 'none';
    editDone.style.display = 'block';
  } else {
    nav.style.display = 'none';
    pinnedUl?.classList.remove('isEditMode');
    unpinnedUl?.classList.remove('isEditMode');
    editActions.style.display = 'block';
    editDone.style.display = 'none';
  }

  const html = document.documentElement;
  html.scrollTo({
    top: html.scrollHeight,
    behavior: 'smooth'
  });
};

const onMouseOver = (event) => {
  event.target.closest('li').classList.add('hover');
}

const onMouseOut = (event) => {
  event.target.closest('li').classList.remove('hover');
}

const buildPopup = async (settings) => {
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

  const nav = document.querySelector('nav');
  const main = document.querySelector('main');
  const footer = document.querySelector('footer');

  const historyOptions = document.getElementById('history-options');
  const allHistory = document.getElementById('allHistory');
  const keepPinned = document.getElementById('keepPinned');
  const clearAllHistory = document.getElementById('clearAllHistory');
  const editActions = document.getElementById('editActions');
  const editDone = document.getElementById('editDone');

  const wrapIconWithSpan = (imgElement, wrapperClass) => {
    const span = document.createElement('span');
    span.classList.add(wrapperClass);
    span.appendChild(imgElement);
    return span;
  };

  const initializePopupPage = async () => {
    nav.style.display = 'none';
    main.innerHTML = `<div><p>${getCurrentLangLabelString('onError')}</p></div>`;
    footer.style.display = 'none';
  };

  const { history = [] } = await browser.storage.local.get('history');

  if (history.length === 0) {
    initializePopupPage();
  }

  const pinnedItems = history.filter(item => item.pinned);
  const unpinnedItems = history.filter(item => !item.pinned);

  const sortedHistory = [
    ...pinnedItems.slice(0, DISPLAY_LIMIT),
    ...unpinnedItems.slice(0, Math.max(0, DISPLAY_LIMIT - pinnedItems.length))
  ];

  /* rendering Main List */
  const pinnedUl = document.createElement('ul');
  pinnedUl.id = 'pinnedHistoryList';
  pinnedUl.classList.add('history-list');

  const unpinnedUl = document.createElement('ul');
  unpinnedUl.id = 'unpinnedHistoryList';
  unpinnedUl.classList.add('history-list');

  const pinnedLabel = document.createElement('h2');
  pinnedLabel.id = 'pinnedLabel';
  pinnedLabel.textContent = `${getCurrentLangLabelString('pinnedLabel')}`;
  pinnedLabel.classList.add('pinned-heading');

  const copyIcons = { 'on': './images/icon-check.svg', 'off': './images/icon-copy.svg'};
  const pinIcons = { 'on': './images/icon-pin-on.svg', 'off': './images/icon-pin-off.svg'};

  const createListItem = (item, targetUl) => {
    const li = document.createElement('li');
    const div = document.createElement('div');
    
    div.textContent = item.text;

    // iconCopy
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
        request: 'TOGGLE_PIN',
        id: itemId
      });

      // Moving LI-Item with Fade-Animation
      li.classList.add('fade-out');

      li.addEventListener('transitionend', (event) => {
        if (event.propertyName === 'opacity') {
          const target = event.target;

          if (target.classList.contains('fade-out')) {
            target.classList.remove('fade-out');
            
            // Get the source UL before moving the item
            const sourceUl = li.closest('ul');
            
            if (li.dataset.pinned === 'false') { /* Pinned */
              if (!document.querySelector('#pinnedHistoryList')) {
                main.prepend(pinnedUl); // Prepend to ensure pinned list is above unpinned
                if (getState('isEditMode')) {
                  pinnedUl.classList.add('isEditMode');
                }
                pinnedUl.parentNode.insertBefore(pinnedLabel, pinnedUl);
              }

              const pinnedItems = Array.from(
                pinnedUl.querySelectorAll(".history-item[data-pinned='true']") || []
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
                  pinnedUl.prepend(li);
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
                  if (!document.querySelector('#unpinnedHistoryList')) {
                    main.appendChild(unpinnedUl); // Append after pinned list
                  }
                  createListItem(nextVisibleItem, unpinnedUl);
                }
              } else {
                if (!document.querySelector('#unpinnedHistoryList')) {
                  main.appendChild(unpinnedUl); // Append after pinned list
                }

                const unpinnedItems = Array.from(
                  unpinnedUl.querySelectorAll(".history-item[data-pinned='false']") || []
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
                  unpinnedUl.appendChild(li);
                }
              }

              li.dataset.pinned = 'false';
              iconPin.src = pinIcons.off;
            }

            // Remove source UL if it has no children
            if (sourceUl && sourceUl.children.length === 0) {
              sourceUl.remove();
  
              if (sourceUl.id === 'pinnedHistoryList') {
                pinnedLabel.remove();
              }
            }

            li.classList.remove('hover');
            updateClearOptionsVisibility();
          }
        }
      });
    });

    const iconPinWrapper = wrapIconWithSpan(iconPin, 'iconPinWrapper');
    const iconCopyWrapper = wrapIconWithSpan(iconCopy, 'iconCopyWrapper');

    li.appendChild(iconPinWrapper);
    li.appendChild(div);
    li.appendChild(iconCopyWrapper);

    li.classList.add('history-item');
    li.dataset.id = item.id;
    li.dataset.pinned = item.pinned;

    li.addEventListener('click', async (event) => {
      if (getState('isEditMode') && !isMacOS()) return false;

      const textToCopy = item.text;
      await navigator.clipboard.writeText(textToCopy);
      
      // send msg to content.js
      browser.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        const langCode = window.navigator.language || 'en';
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
    
    targetUl.appendChild(li);
  };

  // Populate pinned and unpinned lists
  pinnedItems.slice(0, DISPLAY_LIMIT).forEach(item => {
    createListItem(item, pinnedUl);
  });
  unpinnedItems.slice(0, Math.max(0, DISPLAY_LIMIT - pinnedItems.length)).forEach(item => {
    createListItem(item, unpinnedUl);
  });

  // Append both lists to main
  if (pinnedUl.children.length > 0) {
    main.appendChild(pinnedUl);
    pinnedUl.parentNode.insertBefore(pinnedLabel, pinnedUl);
  }
  if (unpinnedUl.children.length > 0) {
    main.appendChild(unpinnedUl);
  }
  
  allHistory.textContent = `${getCurrentLangLabelString('clearHistoryAll')}`;
  keepPinned.textContent = `${getCurrentLangLabelString('clearHistoryOption')}`;

  const showClearOptions = () => {
    const items = document.querySelectorAll('.history-list .history-item');
    const totalCount = items.length;

    const pinnedCount = Array.from(items).filter(
      el => el.getAttribute('data-pinned') === 'true'
    ).length;

    return pinnedCount > 0 && pinnedCount < totalCount;
  };

  let clearOption = settings.get('clearOption');

  const clearOptionHandlers = async (option, settings) => {
    allHistory.classList.toggle('selected', option === 'all');
    keepPinned.classList.toggle('selected', option === 'keep');
    
    await settings.set('clearOption', option);

    clearOption = option;
  };

  allHistory.addEventListener('click', () => clearOptionHandlers('all', settings));
  keepPinned.addEventListener('click', () => clearOptionHandlers('keep', settings));
  
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
        
        // Remove unpinned items
        if (document.querySelector('#unpinnedHistoryList')) {
          unpinnedUl.remove();
        }
        
        if (pinnedOnly.length === 0) {
          initializePopupPage();
        }
      } else {
        await browser.storage.local.remove('history');
        initializePopupPage();
      }

      updateClearOptionsVisibility();
    } catch (error) {
      console.error('[TextClipHistoryExtension] Failed to clear text clippings:', error);
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

  // Settings View
  const settingItems = [
    { key: 'showClipboardPreview', label: `${getCurrentLangLabelString('settingsClipboardPreview')}` },
    { key: 'showInputSource', label: `${getCurrentLangLabelString('settingsShowInputSource')}` },
  ];

  const checkboxes = {};

  const renderSettingsList = async () => {
    settingItems.forEach(({ key, label }) => {
      const checkbox = document.getElementById(key);
      const labelElement = document.querySelector(`label[for="${key}"]`);
      if (!checkbox || !labelElement) return;

      checkboxes[key] = checkbox;

      labelElement.textContent = label;
      checkbox.checked = settings.get(key);

      checkbox.addEventListener('click', (event) => {
        event.target.classList.remove('toggle-disabled');
      });

      const toggleSpan = checkbox.nextElementSibling;
      if (toggleSpan) {
        toggleSpan.addEventListener('click', () => {
          checkbox.click();
        });
      }

      checkbox.addEventListener('change', async () => {
        checkbox.classList.remove('toggle-disabled');
        await settings.set(key, checkbox.checked);
      });
    });
  };

  renderSettingsList();
};

let isInitialized = false;

const initializePopup = async () => {
  if (isInitialized) return;
  isInitialized = true;

  await settings.load();
  try {
    await buildPopup(settings);
  } catch (error) {
    console.error('[TextClipHistoryExtension] Failed to initialize to build the popup:', error);
    isInitialized = false;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup, { once: true });
} else {
  initializePopup();
}
