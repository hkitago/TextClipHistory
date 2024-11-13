//
//  utils.js
//  TextClipHistory
//
//  Created by Hiroyuki KITAGO on 2024/10/31.
//

const getiOSVersion = () => {
  return parseInt((navigator.userAgent.match(/OS (\d+)_/) || [])[1] || 0);
};

export const sanitizeText = (text) => {
  return text
    .replace(/<br\s*\/?>/gi, '\n') // <br>を改行に変換
    .replace(/<\/?[^>]+(>|$)/g, "") // HTMLタグを削除
    .trim(); // 不要な空白を削除
};

export const closeWindow = () => {
  window.close();
  
  if (getiOSVersion() < 18) {
    setTimeout(() => {
      browser.runtime.reload();
    }, 100);
  }
};

