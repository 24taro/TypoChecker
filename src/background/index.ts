import { AISessionManager } from './ai-session'

console.log('TypoChecker Service Worker started')

const aiSession = new AISessionManager()

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('TypoChecker extension installed')
  } else if (details.reason === 'update') {
    console.log('TypoChecker extension updated')
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message)
  
  switch (message.type) {
    case 'CHECK_AI_AVAILABILITY':
      aiSession.checkAvailability()
        .then((availability) => {
          sendResponse({ availability })
        })
        .catch((error) => {
          sendResponse({ error: error.message })
        })
      return true

    case 'START_ANALYSIS':
      handleStartAnalysis(message.tabId)
        .then(sendResponse)
        .catch((error) => {
          console.error('Analysis failed:', error)
          sendResponse({ error: error.message })
        })
      return true
      
    case 'PAGE_CONTENT':
      console.log('Page content received from tab:', sender.tab?.id)
      handlePageContent(message.data)
        .then(sendResponse)
        .catch((error) => {
          console.error('Content processing failed:', error)
          sendResponse({ error: error.message })
        })
      return true
      
    default:
      console.log('Unknown message type:', message.type)
  }
})

async function handleStartAnalysis(tabId: number): Promise<void> {
  try {
    console.log('Starting analysis for tab:', tabId)
    
    await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageContent,
    })
    
    return new Promise((resolve) => {
      const listener = (message: any, sender: any) => {
        if (sender.tab?.id === tabId && message.type === 'PAGE_CONTENT') {
          chrome.runtime.onMessage.removeListener(listener)
          console.log('Content extracted successfully')
          resolve()
        }
      }
      chrome.runtime.onMessage.addListener(listener)
      
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener)
        resolve()
      }, 10000)
    })
  } catch (error) {
    console.error('Failed to start analysis:', error)
    throw error
  }
}

function extractPageContent(): void {
  const content = {
    url: window.location.href,
    title: document.title,
    text: document.body.innerText,
  }
  
  chrome.runtime.sendMessage({
    type: 'PAGE_CONTENT',
    data: content,
  })
}

async function handlePageContent(data: any): Promise<any> {
  try {
    console.log('Processing page content:', {
      url: data.url,
      textLength: data.text?.length || 0,
    })

    // AIセッションを初期化
    await aiSession.initialize()

    // テキストを分析（現時点では全体を一度に送信、Phase 2でチャンク処理を実装）
    const analysisResult = await aiSession.analyzeText(data.text)
    
    // 結果をパース
    const parsedResult = aiSession.parseAnalysisResult(analysisResult)

    // トークン情報を取得
    const tokenInfo = aiSession.getTokensInfo()
    if (tokenInfo) {
      console.log('Token usage:', tokenInfo)
    }

    // Popup UIに結果を送信
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETE',
      data: {
        ...parsedResult,
        url: data.url,
        tokenInfo,
      },
    })

    return { success: true, data: parsedResult }
  } catch (error: any) {
    console.error('Failed to process content:', error)
    
    // エラーをPopup UIに送信
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_ERROR',
      error: {
        code: error.code || 'UNKNOWN',
        message: error.message || 'テキスト分析中にエラーが発生しました',
      },
    })

    throw error
  }
}

export {}