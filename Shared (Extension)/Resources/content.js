(() => {
   /* Global state variables */
   let copyText = '';
   let selectedText = '';

   let iconState = 'default';

   const updateToolbarIcon = async () => {
     const { history = [] } = await browser.storage.local.get('history');
     
     if (history.length > 0) {
       iconState = 'extension-on';
       browser.runtime.sendMessage({ request: 'updateIcon', iconState: iconState });
     }
   };

  document.addEventListener('contextmenu', (event) => {
    if (event.target.tagName === 'A' || event.target.closest('a')) {
      const targetUrl = event.target.href || event.target.closest('a').href;
      
      if (copyText === targetUrl) return;

      if (targetUrl) {
        copyText = targetUrl;
        browser.runtime.sendMessage({
          request: 'saveClipboard',
          text: copyText
        });
        
        updateToolbarIcon();
      }
    }
  });

  const handleClipboardEvent = (event) => {
      const selection = window.getSelection();

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const fragment = range.cloneContents();
        const div = document.createElement('div');
        div.appendChild(fragment);

        let selectedText = '';
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

        selectedText = selectedText.trim();

        if (selectedText !== '') {
          browser.runtime.sendMessage({
            request: 'saveClipboard',
            text: selectedText
          });

          updateToolbarIcon();
        }
      }
  };

  document.addEventListener('copy', handleClipboardEvent);
  document.addEventListener('cut', handleClipboardEvent);
  
  // Init with tricky part https://developer.apple.com/forums/thread/651215
  if (document.readyState !== 'loading') {
    updateToolbarIcon();
  } else {
    document.addEventListener('DOMContentLoaded', updateToolbarIcon, { once: true });
  }
  
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

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.request === 'pasteText') {
      const activeElement = document.activeElement;
      
      if (isEditableElement(activeElement)) {
        if (activeElement.isContentEditable) {
          handleContentEditableInput(activeElement, message.langcode, message.text);
        } else {
          handleInputElementText(activeElement, message.langcode, message.text);
        }

        setTimeout(() => {
          activeElement.focus();
        }, 100);
      }
    }
  });

 })();
