(() => {
  /* Global state variables */
  let lastFocusedElement = null;
  
  const popupIntval = 2000;
  let popupHost = null;
  let popupEl = null;
  let hideTimer = null;

  // Create popup element with Shadow DOM
  const createPopup = () => {
    const host = document.createElement('div');
    host.id = 'textcliphistory-ext-popup-host';
    host.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      z-index: 2147483647;
      pointer-events: none;
    `;

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      .textcliphistory-ext-popup {
        position: absolute;
        background: rgb(255 255 255/.8);
        color: black;
        padding: 4px 10px;
        border-radius: 7px;
        font-size: 12px;
        font-family: -apple-system, sans-serif;
        pointer-events: none;
        display: none;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        line-height: normal;
        box-sizing: border-box;
      }
      @media (prefers-color-scheme: dark) {
        .textcliphistory-ext-popup {
          background: rgb(0 0 0/.8);
          color: white;
        }
      }
      @supports (-apple-visual-effect: -apple-system-glass-material) {
        .textcliphistory-ext-popup {
          background: transparent;
          -apple-visual-effect: -apple-system-glass-material;
        }
      }
    `;

    const div = document.createElement('div');
    div.className = 'textcliphistory-ext-popup';
    div.dir = 'auto';

    shadow.appendChild(style);
    shadow.appendChild(div);

    document.body.appendChild(host);

    return { host, div };
  };

  // Hide popup immediately
  const hidePopup = () => {
    if (popupEl) {
      popupEl.style.display = 'none';
      clearTimeout(hideTimer);
    }
  };

  // Show popup near the input element with RTL support
  const showPopup = (element, inputSourceName) => {
    if (!popupEl) {
      const created = createPopup();
      popupHost = created.host;
      popupEl = created.div;
    }
    
    const rect = element.getBoundingClientRect();
    const isRTL = window.getComputedStyle(element).direction === 'rtl';
    
    popupEl.textContent = inputSourceName;
    popupEl.style.display = 'block';

    const popupHeight = popupEl.offsetHeight;
    const gap = 5;

    let topPosition = rect.top + window.scrollY - popupHeight - gap;

    if (rect.top - popupHeight - gap < 0) {
      topPosition = rect.bottom + window.scrollY + gap;
    }

    popupEl.style.top = `${topPosition}px`;
    
    if (isRTL) {
      popupEl.style.right = 'auto';
      popupEl.style.left = `${rect.right + window.scrollX - popupEl.offsetWidth}px`;
    } else {
      popupEl.style.left = `${rect.left + window.scrollX}px`;
      popupEl.style.right = 'auto';
    }
    
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hidePopup();
    }, popupIntval);
  };

  document.addEventListener('contextmenu', (event) => {
    let copyText = '';

    if (event.target.tagName === 'A' || event.target.closest('a')) {
      const targetUrl = event.target.href || event.target.closest('a').href;

      if (copyText === targetUrl) return;

      if (targetUrl) {
        copyText = targetUrl;
        browser.runtime.sendMessage({
          request: 'saveClipboard',
          text: copyText
        });
      }
    }
  });

  const handleClipboardEvent = (event) => {
    let selectedText = '';

    const activeElement = document.activeElement;

    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      const start = activeElement.selectionStart;
      const end = activeElement.selectionEnd;

      if (start !== null && end !== null && start !== end) {
        selectedText = activeElement.value.substring(start, end);
      }
    } else {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        if (!range.collapsed) {
          const fragment = range.cloneContents();
          const div = document.createElement('div');
          div.appendChild(fragment);

          div.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              selectedText += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.nodeName === 'BR') {
                selectedText += '\n';
              } else {
                selectedText += node.textContent;
              }
            }
            if (node.nodeName === 'DIV' || node.nodeName === 'P') {
              selectedText += '\n';
            }
          });
        }
      }
    }

    selectedText = selectedText.trim();

    if (selectedText !== '') {
      browser.runtime.sendMessage({
        request: 'saveClipboard',
        text: selectedText
      });
    }
  };

  document.addEventListener('copy', handleClipboardEvent);
  document.addEventListener('cut', handleClipboardEvent);
  
  /* Handling Input Element to Paste Text */
  const noSpaceLangs = ['ja', 'zh', 'ko', 'th'];
  const usesSpacesForWords = (langCode) => !noSpaceLangs.includes(langCode);

  const isSearchInput = (element) => {
    if (!element || element.tagName !== 'INPUT') return false;

    const validInputTypes = ['text', 'search'];
    if (!validInputTypes.includes(element.type)) return false;

    const searchKeywords = ['search', 'query', 'keyword', 'find'];
    const attributesToCheck = ['placeholder', 'aria-label', 'name', 'id', 'role', 'enterkeyhint'];

    for (const attr of attributesToCheck) {
      const value = element.getAttribute(attr) || '';
      if (searchKeywords.some(keyword => value.toLowerCase().includes(keyword))) return true;
    }

    for (const attr of element.attributes) {
      if (searchKeywords.some(keyword => attr.value.toLowerCase().includes(attr.value.toLowerCase()))) return true;
    }

    return false;
  };

  const detectEditorType = (element) => {
    if (element.querySelector('[data-testid="tweetTextarea_0"]') || element.querySelector('[data-text="true"]')) {
      return 'draftjs';
    }
    if (element.classList.contains('ProseMirror') || element.querySelector('p[data-placeholder]')) {
      return 'prosemirror';
    }
    if (element.closest('.Am.Al.editable')) {
      return 'gmail';
    }
    return 'unknown';
  };

  const dispatchEditorEvents = (element, text, editorType) => {
    const target =
      editorType === 'draftjs'
        ? element.querySelector('[data-testid="tweetTextarea_0"]') || element
        : element;

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: new DataTransfer(),
      bubbles: true,
      cancelable: true,
    });
    pasteEvent.clipboardData.setData('text/plain', text);

    target.dispatchEvent(pasteEvent);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const handleContentEditableInput = (element, langCode, text) => {
    const editorType = detectEditorType(element);
    const addSpaces = usesSpacesForWords(langCode);

    let modifiedText = text;

    const existingText = element.textContent.trim();
    if (addSpaces && existingText && !/\s$/.test(existingText)) {
      modifiedText = ' ' + text;
    }

    dispatchEditorEvents(element, modifiedText, editorType);
  };

  const handleInputElementText = (element, langCode, text) => {
    const addSpaces = usesSpacesForWords(langCode);
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const currentValue = element.value;

    let leadingSpace = '';
    if (isSearchInput(element)) {
      if (start > 0 && !/\s$/.test(currentValue[start - 1])) leadingSpace = ' ';
    } else if (addSpaces && start > 0 && !/\s$/.test(currentValue[start - 1])) {
      leadingSpace = ' ';
    }

    const modifiedText = leadingSpace + text;

    if (start !== end) {
      element.value = currentValue.slice(0, start) + modifiedText + currentValue.slice(end);
    } else {
      element.value = currentValue.slice(0, start) + modifiedText + currentValue.slice(start);
    }

    const newCursorPos = start + modifiedText.length;
    element.selectionStart = newCursorPos;
    element.selectionEnd = newCursorPos;

    element.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const isEditableElement = (element) => {
    if (!element) return false;
    if (element.isContentEditable) return true;
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return !element.readOnly;
    return false;
  };

  document.addEventListener('focusin', (event) => {
    if (isEditableElement(event.target)) lastFocusedElement = event.target;

    if (event.target.matches('input, textarea, [contenteditable]')) {
      browser.runtime.sendMessage({
        request: 'inputFocused',
      });
    }
  });

  document.addEventListener('focusout', (event) => {
    if (event.target.matches('input, textarea, [contenteditable]')) {
      hidePopup();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isEditableElement(event.target)) lastFocusedElement = null;
  });

  // Listen for keyboard input while popup is visible
  document.addEventListener('keydown', (event) => {
    if (popupEl && popupEl.style.display === 'block') {
      hidePopup();
    }
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.request === 'pasteText') {
      const targetElement = lastFocusedElement;
      if (isEditableElement(targetElement)) {
        if (targetElement.isContentEditable) {
          handleContentEditableInput(targetElement, message.langcode, message.text);
        } else {
          handleInputElementText(targetElement, message.langcode, message.text);
        }

        requestAnimationFrame(() => {
          targetElement.focus();
        });
      } else {
        console.warn('[TextClipHistoryExtension] No valid editable element found.');
      }
    }

    if (message.action === 'showInputSource' && message.inputSource) {
      const activeElement = document.activeElement;
      if (activeElement && activeElement.matches('input, textarea, [contenteditable]')) {
        showPopup(activeElement, message.inputSource.name);
      }
    }
  });
})();
