console.log('TypoChecker Content Script loaded on:', window.location.href)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Content script received message:', message)
  
  if (message.type === 'EXTRACT_CONTENT') {
    const content = extractPageContent()
    sendResponse({ success: true, data: content })
  }
})

function extractPageContent() {
  const content = {
    visibleText: [] as string[],
    hiddenText: [] as string[],
    metadata: [] as string[],
  }
  
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT
        
        const style = window.getComputedStyle(parent)
        const isHidden = style.display === 'none' || style.visibility === 'hidden'
        
        if (isHidden) {
          const text = node.textContent?.trim()
          if (text) {
            content.hiddenText.push(text)
          }
          return NodeFilter.FILTER_REJECT
        }
        
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT
        }
        
        return NodeFilter.FILTER_ACCEPT
      },
    }
  )
  
  let node: Node | null = walker.nextNode()
  while (node) {
    const text = node.textContent?.trim()
    if (text && text.length > 0) {
      content.visibleText.push(text)
    }
    node = walker.nextNode()
  }
  
  document.querySelectorAll('meta[content]').forEach((meta) => {
    const metaContent = (meta as HTMLMetaElement).content
    if (metaContent) {
      content.metadata.push(metaContent)
    }
  })
  
  document.querySelectorAll('img[alt]').forEach((img) => {
    const alt = (img as HTMLImageElement).alt
    if (alt) {
      content.metadata.push(alt)
    }
  })
  
  console.log('Extracted content:', {
    visibleTextCount: content.visibleText.length,
    hiddenTextCount: content.hiddenText.length,
    metadataCount: content.metadata.length,
  })
  
  return content
}

export {}