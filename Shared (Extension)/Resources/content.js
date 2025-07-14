(() => {
  /* Global state variables */
  let lastFocusedElement = null;
  
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
  
  const usesSpacesForWords = (langCode) => {
    return !noSpaceLangs.includes(langCode);
  };

  const isSearchInput = (element) => {
    if (!element || element.tagName !== 'INPUT') return false;

    const validInputTypes = ['text', 'search'];
    if (!validInputTypes.includes(element.type)) return false;

    const searchKeywords = ['search', 'query', 'keyword', 'find'];

    const attributesToCheck = ['placeholder', 'aria-label', 'name', 'id', 'role', 'enterkeyhint'];
    for (const attr of attributesToCheck) {
      const value = element.getAttribute(attr) || '';
      if (searchKeywords.some(keyword => value.toLowerCase().includes(keyword))) {
        return true;
      }
    }

    for (const attr of element.attributes) {
      if (searchKeywords.some(keyword => attr.value.toLowerCase().includes(keyword))) {
        return true;
      }
    }

    return false;
  };

  const handleContentEditableInput = (element, langCode, text) => {
    const addSpaces = usesSpacesForWords(langCode);
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    if (selection.toString()) {
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
    } else {
      const textNode = range.startContainer;
      const offset = range.startOffset;

      let leadingSpace = '';

      if (addSpaces && textNode.nodeType === Node.TEXT_NODE && offset > 0) {
        const currentText = textNode.nodeValue;
        if (!/\s$/.test(currentText.slice(0, offset))) {
          leadingSpace = ' ';
        }
      }

      const modifiedText = leadingSpace + text;

      if (textNode.nodeType === Node.TEXT_NODE) {
        const currentText = textNode.nodeValue;
        if (offset < currentText.length) {
          textNode.nodeValue = currentText.slice(0, offset) + modifiedText + currentText.slice(offset);
        } else {
          textNode.nodeValue = currentText + modifiedText;
        }
      } else {
        element.appendChild(document.createTextNode(modifiedText));
      }

      range.setStart(range.startContainer, range.startOffset + modifiedText.length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const handleInputElementText = (element, langCode, text) => {
    const addSpaces = usesSpacesForWords(langCode);
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const currentValue = element.value;

    let leadingSpace = '';

    if (isSearchInput(element)) {
      if (start > 0 && !/\s$/.test(currentValue[start - 1])) {
        leadingSpace = ' ';
      }
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

    const event = new Event('input', { bubbles: true });
    element.dispatchEvent(event);
  };

  const isEditableElement = (element) => {
    if (!element) return false;
    
    if (element.isContentEditable) return true;
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return !element.readOnly;
    }
    
    return false;
  };

  document.addEventListener('focusin', (event) => {
    if (isEditableElement(event.target)) {
      lastFocusedElement = event.target;
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isEditableElement(event.target)) {
      lastFocusedElement = null;
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

        setTimeout(() => {
          targetElement.focus();
        }, 100);
      } else {
        console.warn('No valid editable element found.');
      }
    }
  });

  /* INIT for Toolbar Icon */
  const initializeContent = async () => {
    await browser.runtime.sendMessage({ request: 'initToolbarIcon' }).catch ((error) => {
      console.error('Failed to update toolbar-icon:', error);
    });
  };
  
  if (document.readyState !== 'loading') {
    initializeContent();
  } else {
    document.addEventListener('DOMContentLoaded', initializeContent, { once: true });
  }
})();
