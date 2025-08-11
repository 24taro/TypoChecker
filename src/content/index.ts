console.log('TypoChecker Content Script loaded on:', window.location.href)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Content script received message:', message)
  
  if (message.type === 'EXTRACT_CONTENT') {
    const content = extractPageContent()
    sendResponse({ success: true, data: content })
  }
})

function extractPageContent() {
  // シンプルにページのテキストを取得
  const text = document.body.innerText || ''
  
  console.log('Extracted text length:', text.length)
  
  return {
    text,
    url: window.location.href,
    title: document.title,
  }
}