(() => {
  const isMacOS = () =>
    navigator.platform.includes('Mac') && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  /* Global state variables */
  let lastFocusedElement = null;

  // ========================================
  // Input source popup
  // ========================================
  const POPUP_DISPLAY_DURATION_MS = 1000;
  let popupHost = null;
  let popupEl = null;
  let hideTimer = null;

  const POPUP_DISPLAY_COOLDOWN_MS = 2000;
  let lastPopupTimestamp = 0;

  let pendingPopupDurationMs = POPUP_DISPLAY_DURATION_MS;
  const COALESCE_WINDOW_MS = 150;
  let lastPointerDownTs = 0;
  const shownOnceForElement = new WeakSet();

  // Popup durations (ms) tuned for recognition vs. intrusiveness.
  // pointerdown: user explicitly clicks/taps to focus -> show slightly longer on first time.
  // focusin: includes keyboard/tab/programmatic focus -> keep slightly shorter.
  const POPUP_DURATIONS = {
    pointerdown: {
      first: 1200, // First time on an element: allow more time for learning/recognition
      repeat: 850, // Subsequent displays on the same element: shorter to reduce distraction
    },
    focusin: {
      first: 1000, // First time via focusin: slightly shorter than pointerdown
      repeat: 750, // Subsequent displays via focusin
    },
  };

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
  let isInputsourceCssLoaded = false;

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

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = browser.runtime.getURL('textcliphistory-ext-inputsource.css');
    link.onload = () => { isInputsourceCssLoaded = true; };
    shadow.appendChild(link);

    const div = document.createElement('div');
    div.className = 'textcliphistory-ext-popup';
    div.dir = 'auto';

    shadow.appendChild(div);
    document.body.appendChild(host);

    return { host, div };
  };

  const hidePopup = () => {
    if (!popupEl || popupEl.style.display !== 'block') return;

    clearTimeout(hideTimer);
    popupEl.style.display = 'none';
  };

  const showPopup = async (element, inputSourceName, durationMs = POPUP_DISPLAY_DURATION_MS) => {
    if (!popupEl) {
      const created = createPopup();
      popupHost = created.host;
      popupEl = created.div;

      let attempts = 0;
      while (!isInputsourceCssLoaded && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
      }
    }

    hidePopup();

    const caretRect = getCaretCoordinates(element);

    popupEl.style.display = 'block';
    popupEl.textContent = inputSourceName;

    requestAnimationFrame(() => {
      const popupWidth = popupEl.offsetWidth;
      const popupHeight = popupEl.offsetHeight;
      const gap = 8;
      const screenPadding = 12;

      let topPosition = caretRect.top - popupHeight - gap;
      if (topPosition < screenPadding) {
        topPosition = caretRect.bottom + gap;
      }

      let leftPosition = caretRect.left - (popupWidth / 2);
      const maxLeft = window.innerWidth - popupWidth - screenPadding;
      const minLeft = screenPadding;
      leftPosition = Math.max(minLeft, Math.min(leftPosition, maxLeft));

      popupEl.style.top = `${topPosition}px`;
      popupEl.style.left = `${leftPosition}px`;
    });

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hidePopup(), durationMs);
  };

  const requestInputSourcePopup = (target) => {
    if (!isMacOS()) return;
    if (!isEditableElement(target)) return;

    browser.runtime.sendMessage({
      request: 'inputFocused',
    });
  };

  // ========================================
  // Clipboard preview
  // ========================================
  const CLIP_DISPLAY_DURATION_MS = 3333;
  
  let clipHost = null;
  let clipEl = null;
  let clipHideTimer = null;
  let isClipCssLoaded = false;

  const hasIcon = (inputElement) => {
    if (!isMacOS() && !inputElement.value) return false;
    if (inputElement.isContentEditable) return false;

    const inputType = inputElement.type.toLowerCase();
    const validTypes = ['text', 'email', 'tel', 'search', 'url'];
    
    if (!validTypes.includes(inputType)) return false;
    
    const autocomplete = inputElement.getAttribute('autocomplete');
    if (autocomplete === 'off') return false;
    
    const iconTriggerValues = [
      'name', 'given-name', 'family-name', 'additional-name', 'email', 'tel', 'tel-national', 'address-line1', 'address-line2', 'address-line3', 'street-address', 'postal-code', 'country', 'organization', 'organization-title'
    ];
    
    if (autocomplete && iconTriggerValues.includes(autocomplete)) return true;
    
    const name = inputElement.name?.toLowerCase() || '';
    const id = inputElement.id?.toLowerCase() || '';
    const combinedStr = name + ' ' + id;
    
    const namePatterns = [
      'name', 'email', 'mail', 'phone', 'tel', 'address', 'zip', 'postal', 'country'
    ];
    
    return namePatterns.some(pattern => combinedStr.includes(pattern));
  };

  const getLatestHistoryItem = async () => {
    try {
      const { history = [] } = await browser.storage.local.get('history');

      if (!Array.isArray(history) || history.length === 0) return null;

      return history[0];
    } catch (error) {
      console.error('[TextClipHistoryExtension] Failed to get latest history item:', error);
      return null;
    }
  };

  const createClipPopup = () => {
    const host = document.createElement('div');
    host.id = 'textcliphistory-ext-clip-host';

    Object.assign(host.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '0',
      zIndex: '2147483647'
    });

    const shadow = host.attachShadow({ mode: 'open' });

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = browser.runtime.getURL('textcliphistory-ext-latestclip.css');
    link.onload = () => { isClipCssLoaded = true; };
    shadow.appendChild(link);

    const div = document.createElement('div');
    div.className = 'textcliphistory-ext-clipboard-popup';
    div.dir = 'auto';

    shadow.appendChild(div);
    document.body.appendChild(host);

    return { host, div };
  };

  const hideClipboardPreview = () => {
    if (!clipEl || clipEl.style.display !== 'block') return;

    clipHost.classList.remove('popup-active');
    clearTimeout(clipHideTimer);
    clipEl.style.display = 'none';
  };

  const showClipboardPreview = async (element) => {
    if (!clipEl) {
      const created = createClipPopup();
      clipHost = created.host;
      clipEl = created.div;

      let attempts = 0;
      while (!isClipCssLoaded && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
      }
    }

    hideClipboardPreview();

    const latestClip = await getLatestHistoryItem();
    if (!latestClip) return;

    clipEl.textContent = latestClip.text;
    clipEl.title = `Paste: ${latestClip.text}`;
    clipEl.onpointerdown = (event) => {
      event.stopPropagation();
      event.preventDefault();

      hideClipboardPreview();

      const targetElement = element;

      if (element === targetElement) {
        const langCode = window.navigator.language || 'en';
        const text = clipEl.textContent;

        if (element.isContentEditable) {
          handleContentEditableInput(element, langCode.substring(0, 2), text);
        } else {
          handleInputElementText(element, langCode.substring(0, 2), text);
        }
      }

      hideClipboardPreview();

      requestAnimationFrame(() => {
        targetElement.focus();
      });
    };

    clipEl.style.display = 'block';

    requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const popupWidth = clipEl.offsetWidth;
      const popupHeight = clipEl.offsetHeight;
      
      const innerPaddingRight = hasIcon(element) ? 40 : 5;

      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      let topPosition = (rect.top + scrollY) + (rect.height / 2) - (popupHeight / 2);
      let leftPosition = (rect.right + scrollX) - popupWidth - innerPaddingRight;

      const elementAbsoluteLeft = rect.left + scrollX;
      if (leftPosition < elementAbsoluteLeft + 5) {
        leftPosition = elementAbsoluteLeft + 5;
      }

      clipEl.style.top = `${topPosition}px`;
      clipEl.style.left = `${leftPosition}px`;
    });

    clearTimeout(clipHideTimer);
    clipHideTimer = setTimeout(() => hideClipboardPreview(), CLIP_DISPLAY_DURATION_MS);
    
    clipHost.classList.add('popup-active');
  };

  // ========================================
  // Getting clipboard by contextmenu
  // ========================================
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

  // ========================================
  // Handling for copy and cut command
  // ========================================
  const handleClipboardEvent = (event) => {
    try {
      let selectedText = '';
      const activeElement = document.activeElement;

      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        if (start !== null && end !== null && start !== end) {
          selectedText = activeElement.value.substring(start, end);
        }
      }

      if (!selectedText) {
        if (event.clipboardData) {
          selectedText = event.clipboardData.getData('text/plain');
        }

        if (!selectedText) {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            selectedText = selection.toString();
          }
        }
      }

      selectedText = selectedText.trim();
      if (!selectedText) return;

      browser.runtime.sendMessage({
        request: 'saveClipboard',
        text: selectedText
      });

      hideClipboardPreview();
    } catch (error) {
      console.error('[TextClipHistoryExtension] Failed to capture clipboard:', error);
    }
  };

  document.addEventListener('copy', handleClipboardEvent);
  document.addEventListener('cut', handleClipboardEvent);
  
  // ========================================
  // Handling input element to paste text
  // ========================================
  const NO_SPACE_LANGS = ['ja', 'zh', 'ko', 'th'];
  const usesSpacesForWords = (langCode) => !NO_SPACE_LANGS.includes(langCode);

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

  const handleContentEditableInput = (element, langCode = 'en', text) => {
    const editorType = detectEditorType(element);
    const addSpaces = usesSpacesForWords(langCode);

    let modifiedText = text;

    const existingText = element.textContent.trim();
    if (addSpaces && existingText && !/\s$/.test(existingText)) {
      modifiedText = ' ' + text;
    }

    dispatchEditorEvents(element, modifiedText, editorType);
  };

  const handleInputElementText = (element, langCode = 'en', text) => {
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

    const tagName = element.tagName.toUpperCase();

    if (tagName === 'TEXTAREA') {
      return !element.readOnly && !element.disabled;
    }

    if (tagName === 'INPUT') {
      const editableTypes = ['text', 'password', 'email', 'number', 'search', 'tel', 'url'];
      const type = element.type.toLowerCase();
      return editableTypes.includes(type) && !element.readOnly && !element.disabled;
    }

    return false;
  };

  // ========================================
  // Event listeners
  // ========================================
  document.addEventListener('focusin', (event) => {
    if (!isEditableElement(event.target)) return;
    if (clipEl && clipEl.style.display === 'block') return;
    
    lastFocusedElement = event.target;

    if (isMacOS()) {
      const now = performance.now();
      const isPointerCoalesced = (now - lastPointerDownTs) < COALESCE_WINDOW_MS && event.target === lastFocusedElement;
      if (isPointerCoalesced) return;

      // Decide the next popup duration for focusin
      const isFirst = !shownOnceForElement.has(event.target);
      pendingPopupDurationMs = isFirst
        ? POPUP_DURATIONS.focusin.first
        : POPUP_DURATIONS.focusin.repeat;

      requestInputSourcePopup(event.target);
    }

    showClipboardPreview(event.target);
  });

  document.addEventListener('focusout', (event) => {
    if (!isEditableElement(event.target)) return;
    hidePopup();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isMacOS()) return;
    if (!isEditableElement(event.target)) return;
    if (clipEl && clipEl.style.display === 'block') return;

    if (isMacOS()) {
      const now = performance.now();
      if (event.target === lastFocusedElement && now - lastPopupTimestamp < POPUP_DISPLAY_COOLDOWN_MS) return;

      lastPopupTimestamp = now;

      // Decide the next popup duration for pointerdown
      const isFirst = !shownOnceForElement.has(event.target);
      pendingPopupDurationMs = isFirst
        ? POPUP_DURATIONS.pointerdown.first
        : POPUP_DURATIONS.pointerdown.repeat;
      lastPointerDownTs = now;

      requestInputSourcePopup(event.target);
    }

    showClipboardPreview(event.target);
  });

  document.addEventListener('touchstart', (event) => {
    if (!isEditableElement(event.target)) return;
    
    showClipboardPreview(event.target);
  });

  document.addEventListener('keydown', (event) => {
    hidePopup();
    hideClipboardPreview();
  });

  window.addEventListener('scroll', (event) => {
    hidePopup();
  }, { capture: true, passive: true });

  // ========================================
  // onMessage
  // ========================================
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
      }
    }

    if (message.request === 'showInputSource' && message.inputSource) {
      const activeElement = document.activeElement;
      if (activeElement && isEditableElement(activeElement)) {
        // Use the duration decided by the triggering event; mark as shown-once for this element.
        showPopup(activeElement, message.inputSource.name, pendingPopupDurationMs);
        shownOnceForElement.add(activeElement);
      }
    }
  });
})();
