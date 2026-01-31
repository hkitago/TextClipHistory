(() => {
  const isMacOS = () =>
    navigator.platform.includes('Mac') && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  /* Global state variables */
  const DEFAULT_SETTINGS = {
    clearOption: 'all',
    showClipboardPreview: false,
    showInputSource: true,
  };

  let config = { ...DEFAULT_SETTINGS };
  let lastFocusedElement = null;

  const requestConfigFromBackground = async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'GET_CURRENT_CONFIG'
      });

      if (response?.config) {
        config = { ...DEFAULT_SETTINGS, ...response.config };
      }
    } catch (error) {
      console.error('[TextClipHistoryExtension] Failed to get config from background:', error);
    }
  };

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
  const minInset = 5;
  const clamp = (min, val, max) => Math.max(min, Math.min(val, max));

  const isLikelyContactField = (el) => {
    if (!el || el.tagName !== 'INPUT') return false;

    const type = (el.type || '').toLowerCase();
    const validTypes = ['text', 'email', 'tel', 'url'];
    if (!validTypes.includes(type)) return false;

    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    const iconTriggerValues = [ 'name', 'given-name', 'family-name', 'additional-name', 'email', 'tel', 'tel-national', 'address-line1', 'address-line2', 'address-line3', 'street-address', 'postal-code', 'country', 'organization', 'organization-title' ];
    if (autocomplete && iconTriggerValues.includes(autocomplete)) return true;

    const combined = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
    const namePatterns = ['name', 'email', 'mail', 'phone', 'tel', 'address', 'zip', 'postal', 'country'];
    return namePatterns.some(p => combined.includes(p));
  };

  const hasWebKitContactsButton = (el) => {
    try {
      const style = getComputedStyle(el, '::-webkit-contacts-auto-fill-button');
      if (!style) return false;

      const w = parseFloat(style.width) || 0;
      const h = parseFloat(style.height) || 0;
      const disp = (style.display || '').toLowerCase();
      const vis = (style.visibility || '').toLowerCase();

      return (w > 0 || h > 0) && disp !== 'none' && vis !== 'hidden';
    } catch {
      return false;
    }
  };

  const getOverlayInsetForInput = (el) => {
    if (!el || el.tagName !== 'INPUT') return { side: 'right', inset: minInset };

    const cs = getComputedStyle(el);
    const dir = (cs.direction || 'ltr').toLowerCase();
    const isRTL = dir === 'rtl';

    const pr = parseFloat(cs.paddingRight) || 0;
    const pl = parseFloat(cs.paddingLeft) || 0;
    const type = (el.type || '').toLowerCase();
    const hasValue = !!el.value;

    // Site-provided icon space via padding on the side of text start/end
    const sidePadding = isRTL ? pl : pr;
    if (sidePadding >= 28) {
      const gap = hasValue ? 10 : 0;

      return { side: isRTL ? 'left' : 'right', inset: sidePadding + gap };
    }

    // Native search clear button (value present and native appearance enabled)
    const appearance = (cs.webkitAppearance || cs.appearance || '').toString().toLowerCase();
    const hasNativeSearchUI = type === 'search' && hasValue && appearance !== 'none';
    if (hasNativeSearchUI) {
      const h = el.clientHeight || parseFloat(cs.height) || 32;
      const icon = clamp(16, h * 0.6, 28);
      const gap = clamp(6, h * 0.15, 10);

      return { side: isRTL ? 'left' : 'right', inset: icon + gap };
    }

    if (isMacOS()) {
      if (hasWebKitContactsButton(el) || isLikelyContactField(el)) {
        const h = el.clientHeight || parseFloat(cs.height) || 32;
        const icon = clamp(26, h * 0.7, 34);
        const gap = clamp(12, h * 0.3, 20);
        const inset = Math.max(sidePadding, icon + gap, 44);

        return { side: isRTL ? 'left' : 'right', inset};
      }
    }

    // Fallback to ensure minimal padding on the relevant side
    const fallbackInset = Math.max(minInset, sidePadding);
    return { side: isRTL ? 'left' : 'right', inset: fallbackInset };
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

  const CLIP_DISPLAY_DURATION_MS = 3333;
  
  let clipHost = null;
  let clipEl = null;
  let clipHideTimer = null;
  let isClipCssLoaded = false;

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
    if (!config.showClipboardPreview) return;

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
      
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      let topPosition = (rect.top + scrollY) + (rect.height / 2) - (popupHeight / 2);

      const { side, inset } = getOverlayInsetForInput(element);
      let leftPosition;

      if (side === 'right') {
        leftPosition = (rect.right + scrollX) - popupWidth - inset;
        const elementAbsoluteLeft = rect.left + scrollX;
        if (leftPosition < elementAbsoluteLeft + minInset) {
          leftPosition = elementAbsoluteLeft + minInset;
        }
      } else {
        // RTL: place relative to left edge plus inset
        leftPosition = (rect.left + scrollX) + inset;
        const elementAbsoluteRight = rect.right + scrollX;
        if (leftPosition + popupWidth > elementAbsoluteRight - minInset) {
          leftPosition = elementAbsoluteRight - minInset - popupWidth;
        }
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

    const type = (element.type || '').toLowerCase();
    if (type === 'search') return true;

    const validInputTypes = ['text', 'search'];
    if (!validInputTypes.includes(type)) return false;

    let confidence = 0;

    const role = (element.getAttribute('role') || '').toLowerCase();
    if (role === 'searchbox' || role === 'search') confidence += 30;

    const enterkeyhint = (element.getAttribute('enterkeyhint') || '').toLowerCase();
    if (enterkeyhint === 'search') confidence += 30;

    const inputmode = (element.getAttribute('inputmode') || '').toLowerCase();
    if (inputmode === 'search') confidence += 25;

    const structuralKeywords = ['search', 'searchbox', 'query'];
    const structuralAttrs = ['name', 'id'];
    
    for (const attr of structuralAttrs) {
      const value = (element.getAttribute(attr) || '').toLowerCase();
      if (structuralKeywords.some(kw => value.includes(kw))) {
        confidence += 20;
        break; // Avoid double scoring
      }
    }

    let contextFound = false;

    const closestSearchAncestor = element.closest('[role="search"]');
    if (closestSearchAncestor) {
      confidence += 15;
      contextFound = true;
    }

    if (!contextFound) {
      const form = element.form || element.closest('form');
      if (form) {
        const formRole = (form.getAttribute('role') || '').toLowerCase();
        if (formRole === 'search') {
          confidence += 15;
          contextFound = true;
        }
      }
    }

    if (!contextFound) {
      const parent = element.parentElement;
      if (parent) {
        const parentClass = (parent.getAttribute('class') || '').toLowerCase();
        
        if (structuralKeywords.some(kw => parentClass.includes(kw))) {
          confidence += 10;
        }
      }
    }

    const textualAttrs = ['placeholder', 'aria-label'];
    let textualScore = 0;

    for (const attr of textualAttrs) {
      const value = (element.getAttribute(attr) || '').toLowerCase();
      if (structuralKeywords.some(kw => value.includes(kw))) {
        textualScore += 5;
      }
    }

    confidence += Math.min(textualScore, 10);
    return confidence >= 20;
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
    hideClipboardPreview();
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

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;

    try {
      const stored = await browser.storage.local.get('settings');
      config = { ...DEFAULT_SETTINGS, ...stored.settings };
    } catch (error) {
      console.warn('[TextClipHistoryExtension] Failed to refresh storage, fallback to background:', error);
      requestConfigFromBackground();
    }
  });

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

  // ========================================
  // Config update: Receive from background
  // ========================================
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONFIG_UPDATED') {
      config = { ...DEFAULT_SETTINGS, ...message.config };
    }
    
    return;
  });

  // ========================================
  // Initialization: Load config from storage
  // ========================================
  (async () => {
    try {
      const stored = await browser.storage.local.get('settings');
      config = { ...DEFAULT_SETTINGS, ...stored.settings };
    } catch (error) {
      console.error('[TextClipHistoryExtension] Failed to load config:', error);
      requestConfigFromBackground();
    }
  })();
})();


