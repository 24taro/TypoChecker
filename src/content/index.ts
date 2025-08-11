import { DOMExtractor } from './dom-extractor'

console.log('TypoChecker Content Script loaded on:', window.location.href)

const domExtractor = new DOMExtractor()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Content script received message:', message)
  
  if (message.type === 'EXTRACT_CONTENT') {
    const content = extractPageContent()
    sendResponse({ success: true, data: content })
  }
})

function extractPageContent() {
  const extractedData = domExtractor.extractPageContent()
  
  // Convert Map to array for metadata
  const metadata: string[] = []
  extractedData.metadata.forEach((value) => {
    metadata.push(value)
  })
  
  console.log('Extracted content:', {
    visibleTextCount: extractedData.visibleText.length,
    hiddenTextCount: extractedData.hiddenText.length,
    metadataCount: metadata.length,
    totalLength: extractedData.totalLength,
  })
  
  return {
    visibleText: extractedData.visibleText,
    hiddenText: extractedData.hiddenText,
    metadata,
    structuredData: extractedData.structuredData,
    totalLength: extractedData.totalLength,
  }
}