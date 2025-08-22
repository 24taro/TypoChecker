import { AISessionManager } from './ai-session'
import type { PageContentMessage, Message } from '../shared/types/messages'

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

    case 'PAGE_CONTENT':
      console.log('Page content received from tab:', sender.tab?.id)
      handlePageContent(message.data)
        .then(sendResponse)
        .catch((error) => {
          console.error('Content processing failed:', error)
          sendResponse({ error: error.message })
        })
      return true

    case 'INITIATE_MODEL_DOWNLOAD':
      console.log('Model download requested')
      aiSession.initiateModelDownload()
        .then(() => {
          sendResponse({ success: true })
        })
        .catch((error) => {
          console.error('Model download failed:', error)
          sendResponse({ error: error.message })
        })
      return true

    case 'START_ANALYSIS':
      console.log('Analysis requested for tab:', message.tabId)
      handleAnalysis(message.tabId, message.userPrompt, sender)
        .then(() => {
          sendResponse({ success: true })
        })
        .catch((error) => {
          console.error('Analysis failed:', error)
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
      const listener = (message: Message, sender: chrome.runtime.MessageSender) => {
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

async function handlePageContent(data: { url: string; title: string; text: string }): Promise<{ success: boolean; data: unknown }> {
  try {
    console.log('Processing page content:', {
      url: data.url,
      textLength: data.text?.length || 0,
    })

    // AIセッションを初期化
    await aiSession.initialize()

    // テキストを分析（デフォルトプロンプト）
    const analysisResult = await aiSession.analyzeText('このページの内容を分析してください', data.text)

    // トークン情報を取得
    const tokenInfo = aiSession.getTokensInfo()
    if (tokenInfo) {
      console.log('Token usage:', tokenInfo)
    }

    // Popup UIに結果を送信
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETE',
      data: {
        fullText: analysisResult,
        url: data.url,
        tokenInfo,
      },
    })

    return { success: true, data: analysisResult }
  } catch (error) {
    console.error('Failed to process content:', error)
    
    const errorObj = error instanceof Error ? error : new Error('Unknown error')
    const errorCode = (error as { code?: string })?.code || 'UNKNOWN'
    
    // エラーをPopup UIに送信
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_ERROR',
      error: {
        code: errorCode,
        message: errorObj.message || 'テキスト分析中にエラーが発生しました',
      },
    })

    throw error
  }
}

async function handleAnalysis(tabId: number, userPrompt: string, sender: chrome.runtime.MessageSender): Promise<void> {
  try {
    console.log('Starting analysis for tab:', tabId)
    
    // ページのHTML全体を抽出
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return {
          url: window.location.href,
          title: document.title,
          html: document.documentElement.outerHTML,
        }
      },
    })
    
    if (!results || results.length === 0 || !results[0].result) {
      throw new Error('Failed to extract page content')
    }
    
    const pageData = results[0].result
    console.log('Page HTML extracted directly:', {
      url: pageData.url,
      htmlLength: pageData.html?.length || 0,
    })
    
    // AI処理を開始
    await processAnalysis(pageData, userPrompt, sender)
    
  } catch (error) {
    console.error('Failed to start analysis:', error)
    throw error
  }
}

async function processAnalysis(
  data: { url: string; title: string; html: string },
  userPrompt: string,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  try {
    console.log('Processing analysis for:', {
      url: data.url,
      htmlLength: data.html?.length || 0,
    })

    // AIセッションを初期化
    await aiSession.initialize()

    // 分析開始を通知
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_START',
      data: {
        message: 'AI処理を実行中...'
      }
    })

    // AI処理を実行
    const analysisResult = await aiSession.analyzeText(userPrompt, data.html)

    // 分析完了を通知
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETE',
      data: {
        fullText: analysisResult
      }
    })

    console.log('Analysis completed:', {
      resultLength: analysisResult.length
    })

  } catch (error) {
    console.error('Analysis error:', error)
    
    let errorMessage = '処理中にエラーが発生しました'
    
    if (error instanceof Error) {
      if (error.message.includes('too large') || error.message.includes('QuotaExceededError') || error.name === 'QuotaExceededError') {
        errorMessage = 'ページのHTMLが大きすぎるため処理できません。より短いページでお試しください。'
      } else {
        errorMessage = error.message
      }
    }
    
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_ERROR',
      data: {
        message: errorMessage,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
    
    throw error
  }
}