(() => {
  /* Global state variables */
  let lastFocusedElement = null;
  
  const popupIntval = 1500;
  let popupHost = null;
  let popupEl = null;
  let hideTimer = null;

  const applyTheme = (el) => {
    if (!el) return;

    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    const lightStyles = {
      background: 'rgb(255 255 255 / 60%)',
      color: 'black',
      backdropFilter: 'blur(5px)',
      WebkitBackdropFilter: 'blur(5px)'
    };

    const darkStyles = {
      background: 'rgb(0 0 0 / 60%)',
      color: 'white',
      backdropFilter: 'blur(5px)',
      WebkitBackdropFilter: 'blur(5px)'
    };

    Object.assign(el.style, isDarkMode ? darkStyles : lightStyles);
  };

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (popupEl) {
      applyTheme(popupEl);
    }
  });

  const getCaretCoordinates = (element) => {
    const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';

    if (!isInput && element.isContentEditable) {
      // for ContentEditable
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0).cloneRange();
        let rects = range.getClientRects();

        if (rects.length === 0) {
          const tempSpan = document.createElement('span');
          tempSpan.appendChild(document.createTextNode('\u200b'));
          range.insertNode(tempSpan);
          const rect = tempSpan.getBoundingClientRect();
          tempSpan.parentNode.removeChild(tempSpan);
          return { top: rect.top, left: rect.left, width: 0, height: rect.height, bottom: rect.bottom };
        }

        const r = rects[0];
        return { top: r.top, left: r.left, width: 0, height: r.height, bottom: r.bottom };
      }
      return element.getBoundingClientRect();
    } else {
      // --- for Input / Textarea
      const { selectionStart, value } = element;
      const style = window.getComputedStyle(element);

      const div = document.createElement('div');
      const propertiesToCopy = [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
        'lineHeight', 'textTransform', 'wordSpacing', 'textIndent',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'boxSizing', 'whiteSpace', 'wordBreak'
      ];

      propertiesToCopy.forEach(prop => div.style[prop] = style[prop]);

      div.style.position = 'fixed';
      div.style.visibility = 'hidden';
      div.style.top = '0';
      div.style.left = '0';

      div.style.width = element.offsetWidth + 'px';

      div.textContent = value.substring(0, selectionStart);

      const span = document.createElement('span');
      span.textContent = value.substring(selectionStart, selectionStart + 1) || '.';
      div.appendChild(span);

      document.body.appendChild(div);

      const elementRect = element.getBoundingClientRect();

      const top = elementRect.top + span.offsetTop - element.scrollTop;
      const left = elementRect.left + span.offsetLeft - element.scrollLeft;
      const height = span.offsetHeight;

      document.body.removeChild(div);

      return { top, left, width: 0, height, bottom: top + height };
    }
  };

  // Create popup element with Shadow DOM
  const createPopup = () => {
    const host = document.createElement('div');
    host.id = 'textcliphistory-ext-popup-host';

    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      zIndex: '2147483647',
      pointerEvents: 'none'
    });

    const shadow = host.attachShadow({ mode: 'open' });

    const div = document.createElement('div');
    div.className = 'textcliphistory-ext-popup';
    div.dir = 'auto';

    Object.assign(div.style, {
      position: 'absolute',
      padding: '4px 10px',
      border: '1px solid rgb(0 0 0 / 30%)',
      borderRadius: '9px',
      fontSize: '12px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      pointerEvents: 'none',
      display: 'none',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgb(0 0 0 / 30%)',
      lineHeight: 'normal',
      boxSizing: 'border-box'
    });

    // 初回テーマ適用
    applyTheme(div);

    shadow.appendChild(div);
    document.body.appendChild(host);

    return { host, div };
  };

  const hidePopup = () => {
    if (popupEl) {
      popupEl.style.display = 'none';
      clearTimeout(hideTimer);
    }
  };

  const showPopup = (element, inputSourceName) => {
    if (!popupEl) {
      const created = createPopup();
      popupHost = created.host;
      popupEl = created.div;
    }

    hidePopup();

    const caretRect = getCaretCoordinates(element);

    popupEl.textContent = inputSourceName;
    popupEl.style.display = 'block';

    const popupWidth = popupEl.offsetWidth;
    const popupHeight = popupEl.offsetHeight;
    const gap = 8;
    const screenPadding = 12;

    // Cal for Y
    let topPosition = caretRect.top - popupHeight - gap;
    if (topPosition < screenPadding) {
      topPosition = caretRect.bottom + gap;
    }

    // Cal for X
    let leftPosition = caretRect.left - (popupWidth / 2);

    const maxLeft = window.innerWidth - popupWidth - screenPadding;
    const minLeft = screenPadding;

    leftPosition = Math.max(minLeft, Math.min(leftPosition, maxLeft));

    popupEl.style.top = `${topPosition}px`;
    popupEl.style.left = `${leftPosition}px`;

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hidePopup(), popupIntval);
  };

  const requestInputSourcePopup = (target) => {
    if (!isEditableElement(target)) return;

    lastFocusedElement = target;

    browser.runtime.sendMessage({
      request: 'inputFocused',
    });
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
    if (!isEditableElement(event.target)) return;
    requestInputSourcePopup(event.target);
  });

  document.addEventListener('focusout', (event) => {
    if (!isEditableElement(event.target)) return;
    hidePopup();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isEditableElement(event.target)) {
      lastFocusedElement = null;
      return;
    }

    requestInputSourcePopup(event.target);
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
      if (activeElement && isEditableElement(activeElement)) {
        showPopup(activeElement, message.inputSource.name);
      }
    }
  });
})();
