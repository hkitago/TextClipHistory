//
//  popup.js
//  TextClipHistory
//
//  Created by Hiroyuki KITAGO on 2024/11/01.
//

import { sanitizeText, closeWindow } from './utils.js';
import { labelStrings, getCurrentLangCode } from './localization.js';
const langCode = getCurrentLangCode();

/* Global variables */
const closeWindowTime = 1500;
let closeTimeout;
const idleWindowTime = 3000;
let idleTimeout;
let lastMousePosition = { x: 0, y: 0 };

/* Init for auto-close */
const initPage = () => {
  
  browser.runtime.sendMessage({ request: "checkStorage" }).then((response) => {
    console.log(response);
    if (!response.hasHistory) {
      setTimeout(() => {
        closeWindow();
      }, closeWindowTime);
    }
  }).catch(error => {
    console.error("Failed to check storage:", error);
  });
  
};

// Init with tricky part https://developer.apple.com/forums/thread/651215
if (document.readyState !== 'loading') {
  initPage();
} else {
  document.addEventListener('DOMContentLoaded', initPage);
}

const formatText = (text) => {
  const decoder = document.createElement('div');
  decoder.innerHTML = text;
  const decodedText = decoder.textContent;
  
  return decodedText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => {
      return line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    })
    .join('<br>');
};

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

  const sortedHistory = [
    ...history.filter(item => item.pinned),
    ...history.filter(item => !item.pinned)
  ];

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

  /* rendering Main List */
  const ul = document.createElement('ul');
  const pinIcons = {"on":"./images/icon-pin-on.svg", "off":"./images/icon-pin-off.svg"};
  sortedHistory.forEach(item => {
    const li = document.createElement('li');
    const div = document.createElement('div');
    console.log(item.text);
    const clipboardText = formatText(item.text);

    const icon = document.createElement('img');
    icon.src = item.pinned ? pinIcons.on : pinIcons.off;

    icon.addEventListener('click', async (event) => {
      event.stopPropagation();

      const itemId = li.dataset.id;

      await browser.runtime.sendMessage({
        request: 'togglePin',
        id: itemId
      });

      if (li.dataset.pinned === 'false') {
        li.dataset.pinned = 'true';
        icon.src = pinIcons.on;
      } else {
        li.dataset.pinned = 'false';
        icon.src = pinIcons.off;
      }
    });

    div.innerHTML = clipboardText;

    li.appendChild(div);
    li.appendChild(icon);
    li.classList.add('history-item');
    li.dataset.id = item.id;
    li.dataset.pinned = item.pinned;

    li.addEventListener('click', async (event) => {
      const textToCopy = sanitizeText(item.text);
      
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
  });

  main.appendChild(ul);

  editActions.style.display = 'none';
  editDone.style.display = 'none';
});
