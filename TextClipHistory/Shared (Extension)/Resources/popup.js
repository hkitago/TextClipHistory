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

  const ul = document.createElement('ul');
  
  sortedHistory.forEach(item => {
    const li = document.createElement('li');
    const div = document.createElement('div');
    const clipboardText = formatText(item.text);
    div.innerHTML = clipboardText; // HTMLとして保持する

    li.appendChild(div);
    li.classList.add('history-item');
    li.dataset.id = item.id;
    li.dataset.pinned = item.pinned;

    li.addEventListener('click', (event) => {
      const textToCopy = sanitizeText(clipboardText);
      
      navigator.clipboard.writeText(textToCopy);
      closeWindow();
    });

    ul.appendChild(li);
  });

  main.appendChild(ul);

  editActions.style.display = 'none';
  editDone.style.display = 'none';
});

