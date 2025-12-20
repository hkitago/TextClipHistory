//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Hiroyuki KITAGO on 2024/10/23.
//

import SafariServices

#if os(macOS)
import Carbon
#endif

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        
        guard let message = request?.userInfo?[SFExtensionMessageKey] else {
            context.completeRequest(returningItems: [], completionHandler: nil)
            return
        }
        
        _ = message
        
        #if os(macOS)
        handleInputSourceRequest(context: context)
        #else
        // Input source detection is macOS-only.
        let response = NSExtensionItem()
        response.userInfo = [
            SFExtensionMessageKey: [
                "status": "error",
                "error": "Input source detection is only available on macOS"
            ]
        ]
        context.completeRequest(returningItems: [response], completionHandler: nil)
        #endif
    }
    
    #if os(macOS)
    private func handleInputSourceRequest(context: NSExtensionContext) {
        guard let inputSource = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue() else {
            let response = NSExtensionItem()
            response.userInfo = [
                SFExtensionMessageKey: [
                    "status": "error",
                    "error": "Failed to get input source"
                ]
            ]
            context.completeRequest(returningItems: [response], completionHandler: nil)
            return
        }
        
        var sourceName: String = "unknown"
        if let raw = TISGetInputSourceProperty(inputSource, kTISPropertyLocalizedName) {
            let value = Unmanaged<CFTypeRef>.fromOpaque(raw).takeUnretainedValue()
            if CFGetTypeID(value) == CFStringGetTypeID() {
                sourceName = value as! String
            }
        }
        
        // Determine whether only one user-visible input source exists (matches what users can switch in the menu).
        let isSingle = isSingleInputSource()
        
        let response = NSExtensionItem()
        response.userInfo = [
            SFExtensionMessageKey: [
                "status": "success",
                "inputSource": [
                    "name": sourceName,
                    "isSingleInputSource": isSingle
                ]
            ]
        ]
        
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
    
    /// Returns true if the set of user-visible keyboard input sources is exactly one.
    /// Heuristics:
    /// - Category: Keyboard input sources
    /// - Enabled only
    /// - User-facing: has languages or is ASCII-capable
    /// - Optional ID-based blacklist hook for future adjustments
    private func isSingleInputSource() -> Bool {
        // Include all installed to reduce cache effects when enumerating input sources.
        let properties: [String: Any] = [
            kTISPropertyInputSourceCategory as String: kTISCategoryKeyboardInputSource as String
        ]
        
        guard let sourceList = TISCreateInputSourceList(properties as CFDictionary, false)?
            .takeRetainedValue() as? [TISInputSource] else {
            // Fail-safe: treat as single to avoid showing UI when retrieval fails.
            return true
        }
        
        // Placeholder for future expansion: exclude known non-menu/functional/internal items by ID substring.
        // Start empty and add entries based on real-world logs as needed.
        let excludedIDSubstrings: [String] = [
            // e.g. "UnicodeHexInput", ".EmojiFunctionRowItem", ".KanaFunctionRowItem",
            //      "TrackpadHandwriting", ".Handwriting", ".Pinyin-HW", ".Wubi-HW"
        ]
        
        var visibleCount = 0
        
        for source in sourceList {
            let isEnabled: Bool = {
                if let raw = TISGetInputSourceProperty(source, kTISPropertyInputSourceIsEnabled) {
                    let value = Unmanaged<CFTypeRef>.fromOpaque(raw).takeUnretainedValue()
                    return CFBooleanGetValue((value as! CFBoolean))
                }
                return false
            }()
            if !isEnabled { continue }
            
            // User-facing heuristic
            let hasLanguages: Bool = {
                if let raw = TISGetInputSourceProperty(source, kTISPropertyInputSourceLanguages) {
                    let value = Unmanaged<CFTypeRef>.fromOpaque(raw).takeUnretainedValue()
                    if CFGetTypeID(value) == CFArrayGetTypeID(),
                       let arr = value as? [Any] {
                        return !arr.isEmpty
                    }
                }
                return false
            }()
            
            let isASCIICapable: Bool = {
                if let raw = TISGetInputSourceProperty(source, kTISPropertyInputSourceIsASCIICapable) {
                    let value = Unmanaged<CFTypeRef>.fromOpaque(raw).takeUnretainedValue()
                    return CFBooleanGetValue((value as! CFBoolean))
                }
                return false
            }()
            
            if !(hasLanguages || isASCIICapable) {
                continue
            }
            
            // ID-based exclusion (blacklist to be expanded later if needed).
            if let raw = TISGetInputSourceProperty(source, kTISPropertyInputSourceID) {
                let value = Unmanaged<CFTypeRef>.fromOpaque(raw).takeUnretainedValue()
                if CFGetTypeID(value) == CFStringGetTypeID(),
                   let id = value as? String {
                    if excludedIDSubstrings.contains(where: { id.contains($0) }) {
                        continue
                    }
                }
            }
            
            visibleCount += 1
            
            // Early exit: if more than one is found, not single.
            if visibleCount > 1 { return false }
        }
        
        return visibleCount <= 1
    }
    #endif
}
