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

 })();
