//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Hiroyuki KITAGO on 2024/10/23.
//

import SafariServices
import os.log

#if os(macOS)
import Carbon
#endif

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    
    private let logger = Logger(subsystem: "com.example.safari-extension", category: "InputSource")
    
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        
        guard let message = request?.userInfo?[SFExtensionMessageKey] else {
            logger.error("Failed to retrieve message from extension")
            context.completeRequest(returningItems: [], completionHandler: nil)
            return
        }
        
        logger.info("Received message from extension: \(String(describing: message))")
        
        #if os(macOS)
        handleInputSourceRequest(context: context)
        #else
        // iOS does not support input source detection
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
        // Get current input source
        guard let inputSource = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue() else {
            logger.error("Failed to get current input source")
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
        
        // Get input source ID
        var sourceID: String = "unknown"
        if let raw = TISGetInputSourceProperty(inputSource, kTISPropertyInputSourceID) {
            let value = Unmanaged<CFTypeRef>.fromOpaque(raw).takeUnretainedValue()
            if CFGetTypeID(value) == CFStringGetTypeID() {
                sourceID = value as! String
            }
        }
        
        // Get localized name
        var sourceName: String = "unknown"
        if let raw = TISGetInputSourceProperty(inputSource, kTISPropertyLocalizedName) {
            let value = Unmanaged<CFTypeRef>.fromOpaque(raw).takeUnretainedValue()
            if CFGetTypeID(value) == CFStringGetTypeID() {
                sourceName = value as! String
            }
        }
        
        // Get input source category
        var sourceCategory: String = "unknown"
        if let raw = TISGetInputSourceProperty(inputSource, kTISPropertyInputSourceCategory) {
            let value = Unmanaged<CFTypeRef>.fromOpaque(raw).takeUnretainedValue()
            if CFGetTypeID(value) == CFStringGetTypeID() {
                sourceCategory = value as! String
            }
        }
        
        // Get count of enabled input sources
        let enabledCount = getEnabledInputSourceCount()
        
        logger.info("Current input source: \(sourceName) (\(sourceID)), enabled count: \(enabledCount)")
        
        // Create response and return to extension
        let response = NSExtensionItem()
        response.userInfo = [
            SFExtensionMessageKey: [
                "status": "success",
                "inputSource": [
                    "id": sourceID,
                    "name": sourceName,
                    "category": sourceCategory,
                    "timestamp": Date().timeIntervalSince1970,
                    "enabledCount": enabledCount
                ]
            ]
        ]
        
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
    
    private func getEnabledInputSourceCount() -> Int {
        // Safely unwrap CFString? keys and values
        guard
            let categoryKey = kTISPropertyInputSourceCategory as String?,
            let selectCapableKey = kTISPropertyInputSourceIsSelectCapable as String?
        else {
            logger.warning("Failed to unwrap TIS property keys")
            return 0
        }
        
        // Get all selectable (enabled) input sources
        let properties: [String: Any] = [
            categoryKey: kTISCategoryKeyboardInputSource as String,
            selectCapableKey: true
        ]
        
        guard let sourceList = TISCreateInputSourceList(properties as CFDictionary, false)?.takeRetainedValue() else {
            logger.warning("Failed to get input source list")
            return 0
        }
        
        let count = CFArrayGetCount(sourceList)
        logger.info("Found \(count) enabled input sources")
        
        return count
    }
    #endif
}
