# <img src="https://raw.githubusercontent.com/hkitago/TextClipHistory/refs/heads/main/Shared%20(Extension)/Resources/images/icon.svg" height="36" valign="bottom"/> TextClipHistory for Safari Extension

This Safari extension empowers you to manage text snippets with ease. Save up to 10 phrases, pin your favorites, and insert them instantly into any input field—or copy to your clipboard when no field is active. It works seamlessly across your browsing, streamlining repetitive tasks wherever you are.

Perfect for AI prompt engineers, customer support teams, sales pros, and anyone tackling web forms or messages daily. Whether you're filling forms, crafting prompts, replying to inquiries, or managing web apps, this tool saves time and boosts efficiency.

Store once, use anywhere in Safari. Elevate your productivity with this smart, versatile companion on any device.

## Installation & Uninstallation

### Installation

To install the extension on iOS or iPadOS, go to Settings > Apps > Safari > Extensions, or enable the extension by toggling it on in the Manage Extensions option found in the Safari address bar.
For macOS, open Safari, go to Safari > Settings > Extensions, and enable the extension from there.

### Uninstallation

To uninstall the extension, similarly to the installation process, toggle the extension off, or remove it completely by selecting the extension icon on the Home Screen and choosing "Delete app".

## Usage

1. Load a web page.
2. Select the text within the web page and copy it. The extension also supports the 'Cut' and 'Copy link' command from the context menu.
3. Tap the icon next to the address bar and choose the extension.
4. A window will slide up from the bottom on iPhone, or a pop-up window will appear on iPad and Mac; select an item of text for pasting and click or tap it. If an input field (including textareas) is focused, the selected text will be inserted automatically.

> [!IMPORTANT]
> Some rich-text editors such as Quill and Gutenberg (WordPress Block Editor) use complex internal structures including Shadow DOM, virtual DOM, or iframes. Because of these architectural constraints, the extension currently offers limited compatibility with these editors. Improvements are planned, but full integration may require additional event bridging.

> [!NOTE] 
> - Due to security concerns, the window will automatically close after 3 minutes of idle time while the popover is open, or immediately if the focus is lost.
> - If you enable the extension and it doesn't function correctly, please refresh the page, or close and restart Safari, and try again.

## Latest Version

### [26.1] - 2026-02-02

- Added the latest text clipping display, showing the most recently saved text near the text cursor
- Handled complex character input correctly, ensuring accurate text clipping display
- Refined search input detection logic, reducing unintended activation across different input fields

Previous Updates: [CHANGELOG.md](./CHANGELOG.md)

## Known Issues

- Copying text extracted from images using OCR, Safari's Reader mode, PDF, or certain web-based rich text editors may not work as expected. Looking into possible solutions.

## Compatibility

- iOS/iPadOS 16.6+
- macOS 12.4+

## License

This project is open-source and available under the [MIT License](LICENSE). Feel free to use and modify it as needed.

## Contact

You can reach me via [email](mailto:hkitago@icloud.com?subject=Support%20for%20TextClipHistory).

## Additional Information

### Related Links

- App Store: [TextClipHistory on the App Store](https://apps.apple.com/app/textcliphistory-for-safari/id6737747660)
- [Get extensions to customize Safari on iPhone - Apple Support](https://support.apple.com/guide/iphone/iphab0432bf6/18.0/ios/18.0)
- [Get extensions to customize Safari on Mac - Apple Support](https://support.apple.com/guide/safari/get-extensions-sfri32508/mac)
- Privacy Policy Page: [Privacy Policy – hkitago software dev](https://hkitago.com/privacy-policy/)
- Support Page: [hkitago/TextClipHistory](https://github.com/hkitago/TextClipHistory/)
