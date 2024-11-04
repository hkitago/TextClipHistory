(() => {
   /* Global state variables */
   let copyText = '';
   let selectedText = '';

   let iconState = 'default';

   const updateToolbarIcon = async () => {
     const { history = [] } = await browser.storage.local.get('history');
     
     if (history.length > 0) {
       iconState = "extension-on";
       browser.runtime.sendMessage({ request: "updateIcon", iconState: iconState });
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

      // 改行を含むテキストを生成
      let selectedText = '';
      div.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          selectedText += node.textContent; // テキストノードの内容を取得
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // <br>要素を改行に変換
          if (node.nodeName === 'BR') {
            selectedText += '\n';
          } else {
            // 他の要素のテキストを取得
            selectedText += node.textContent;
          }
        }
        // 改行を追加する場合のロジック（条件に応じて）
        if (node.nodeName === 'DIV' || node.nodeName === 'P') {
          selectedText += '\n'; // ブロック要素の場合、改行を追加
        }
      });

      selectedText = selectedText.trim(); // 最終的なトリミング

      if (selectedText !== '') {
        browser.runtime.sendMessage({
          request: 'saveClipboard',
          text: selectedText
        });

        updateToolbarIcon();
        // console.log('Selected Text:', selectedText); // デバッグ用に出力
      }
    }
  });

   // Init with tricky part https://developer.apple.com/forums/thread/651215
   if (document.readyState !== 'loading') {
     updateToolbarIcon();
   } else {
     document.addEventListener('DOMContentLoaded', updateToolbarIcon);
   }


  function handleContentEditableInput(element, text) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    
    if (selection.toString()) {
      // テキストが選択されている場合は置換
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
    } else {
      // 選択がない場合はキャレット位置を考慮
      const textNode = range.startContainer;
      const offset = range.startOffset;
      
      if (textNode.nodeType === Node.TEXT_NODE) {
        const currentText = textNode.nodeValue;
        if (offset < currentText.length) {
          // キャレットの後ろに文字がある場合は前に挿入
          textNode.nodeValue = currentText.slice(0, offset) + text + currentText.slice(offset);
        } else {
          // キャレットが末尾の場合は後ろに追加
          textNode.nodeValue = currentText + text;
        }
      } else {
        // テキストノードでない場合は新しいテキストノードを作成
        element.appendChild(document.createTextNode(text));
      }
    }
  }

  function handleInputElementText(element, text) {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const currentValue = element.value;
    
    if (start !== end) {
      // テキストが選択されている場合は置換
      element.value = currentValue.slice(0, start) + text + currentValue.slice(end);
    } else {
      // キャレット位置を考慮
      if (start < currentValue.length) {
        // キャレットの後ろに文字がある場合は前に挿入
        element.value = currentValue.slice(0, start) + text + currentValue.slice(start);
      } else {
        // キャレットが末尾の場合は後ろに追加
        element.value = currentValue + text;
      }
    }
    
    // キャレット位置を更新
    element.selectionStart = start + text.length;
    element.selectionEnd = start + text.length;
    
    // 変更イベントを発火
    const event = new Event('input', { bubbles: true });
    element.dispatchEvent(event);
  }
  // 入力可能な要素かどうかをチェックする関数
  function isEditableElement(element) {
    if (!element) return false;
    
    // contentEditableな要素
    if (element.isContentEditable) return true;
    
    // input, textarea要素
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      // readonlyでないことを確認
      return !element.readOnly;
    }
    
    return false;
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.request === "pasteText") {
      // フォーカスされている要素を取得
      const activeElement = document.activeElement;
      
      // 入力可能な要素かチェック
      if (isEditableElement(activeElement)) {
        if (activeElement.isContentEditable) {
          // contentEditableな要素の場合
          handleContentEditableInput(activeElement, message.text);
        } else {
          // input, textareaの場合
          handleInputElementText(activeElement, message.text);
        }
        
        // フォーカスを維持
        setTimeout(() => {
          activeElement.focus();
        }, 100);
      }
    }
  });

 })();
