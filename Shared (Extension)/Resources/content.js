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

  document.addEventListener('copy', (event) => {
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
  });
  
  // Init with tricky part https://developer.apple.com/forums/thread/651215
  if (document.readyState !== 'loading') {
   updateToolbarIcon();
  } else {
   document.addEventListener('DOMContentLoaded', updateToolbarIcon);
  }


  const handleContentEditableInput = (element, text) => {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    
    if (selection.toString()) {
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
    } else {
      const textNode = range.startContainer;
      const offset = range.startOffset;
      
      if (textNode.nodeType === Node.TEXT_NODE) {
        const currentText = textNode.nodeValue;
        if (offset < currentText.length) {
          textNode.nodeValue = currentText.slice(0, offset) + text + currentText.slice(offset);
        } else {
          textNode.nodeValue = currentText + text;
        }
      } else {
        element.appendChild(document.createTextNode(text));
      }
    }
  }

  const handleInputElementText = (element, text) => {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const currentValue = element.value;
    
    if (start !== end) {
      element.value = currentValue.slice(0, start) + text + currentValue.slice(end);
    } else {
      if (start < currentValue.length) {
        element.value = currentValue.slice(0, start) + text + currentValue.slice(start);
      } else {
        element.value = currentValue + text;
      }
    }
    
    element.selectionStart = start + text.length;
    element.selectionEnd = start + text.length;
    
    const event = new Event('input', { bubbles: true });
    element.dispatchEvent(event);
  }

  const isEditableElement = (element) => {
    if (!element) return false;
    
    if (element.isContentEditable) return true;
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return !element.readOnly;
    }
    
    return false;
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.request === 'pasteText') {
      const activeElement = document.activeElement;
      
      if (isEditableElement(activeElement)) {
        if (activeElement.isContentEditable) {
          handleContentEditableInput(activeElement, message.text);
        } else {
          handleInputElementText(activeElement, message.text);
        }

        setTimeout(() => {
          activeElement.focus();
        }, 100);
      }
    }
  });

 })();
