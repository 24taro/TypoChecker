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

    case 'START_STREAMING_ANALYSIS':
      console.log('Streaming analysis requested for tab:', message.tabId)
      handleStreamingAnalysis(message.tabId, sender)
        .then(() => {
          sendResponse({ success: true })
        })
        .catch((error) => {
          console.error('Streaming analysis failed:', error)
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

    // テキストを分析
    const analysisResult = await aiSession.analyzeText(data.text)

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

async function handleStreamingAnalysis(tabId: number, sender: chrome.runtime.MessageSender): Promise<void> {
  try {
    console.log('Starting streaming analysis for tab:', tabId)
    
    // ページコンテンツを直接抽出（メッセージ競合を回避）
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return {
          url: window.location.href,
          title: document.title,
          text: document.body.innerText,
        }
      },
    })
    
    if (!results || results.length === 0 || !results[0].result) {
      throw new Error('Failed to extract page content')
    }
    
    const pageData = results[0].result
    console.log('Page content extracted directly:', {
      url: pageData.url,
      textLength: pageData.text?.length || 0,
    })
    
    // ストリーミング解析を開始
    await processStreamingAnalysis(pageData, sender)
    
  } catch (error) {
    console.error('Failed to start streaming analysis:', error)
    throw error
  }
}

async function processStreamingAnalysis(
  data: { url: string; title: string; text: string },
  sender: chrome.runtime.MessageSender
): Promise<void> {
  try {
    console.log('Processing streaming analysis for:', {
      url: data.url,
      textLength: data.text?.length || 0,
    })

    // AIセッションを初期化
    await aiSession.initialize()

    // ストリーミング開始を通知
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'ANALYSIS_STREAM_START',
        data: {
          message: 'AI分析を開始しています...'
        }
      })
    }

    // ストリーミング解析を実行
    let fullResponse = ''
    let chunkCount = 0
    for await (const streamData of aiSession.analyzeTextStreaming(
      data.text,
      undefined, // コールバックは使わずに、for awaitで処理
    )) {
      chunkCount++
      fullResponse += streamData.chunk

      // 進捗をPopupに送信
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'ANALYSIS_STREAM_CHUNK',
          data: {
            chunk: streamData.chunk,
            progress: streamData.isComplete ? 100 : Math.min(chunkCount * 10, 90)
          }
        })
      }

      if (streamData.isComplete) {
        break
      }
    }

    // ストリーミング完了を通知
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'ANALYSIS_STREAM_END',
        data: {
          fullText: fullResponse
        }
      })
    }

    console.log('Streaming analysis completed:', {
      textLength: fullResponse.length
    })

  } catch (error) {
    console.error('Streaming analysis error:', error)
    
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'ANALYSIS_STREAM_ERROR',
        data: {
          message: 'ストリーミング分析中にエラーが発生しました',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }
    
    throw error
  }
}