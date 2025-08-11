import { AISessionManager } from './ai-session'
import { ChunkProcessor } from './chunk-processor'
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

    // ChunkProcessorを使用してテキストを処理
    const chunkProcessor = new ChunkProcessor()
    
    // テキストをチャンクに分割
    const chunks = chunkProcessor.splitIntoChunks(data.text)
    console.log(`Split text into ${chunks.length} chunks`)

    // チャンクを処理（進捗報告付き）
    const chunkResults = await chunkProcessor.processChunks(
      chunks,
      (text) => aiSession.analyzeText(text),
      (current, total) => {
        // 進捗をPopup UIに送信
        chrome.runtime.sendMessage({
          type: 'PROGRESS_UPDATE',
          data: {
            current,
            total,
            phase: 'analyzing' as const,
          },
        })
      }
    )

    // 結果をマージ
    const allErrors = chunkProcessor.mergeResults(chunkResults)
    
    // 統計情報を計算
    const stats = {
      totalErrors: allErrors.length,
      typoCount: allErrors.filter(e => e.type === 'typo').length,
      grammarCount: allErrors.filter(e => e.type === 'grammar').length,
      japaneseCount: allErrors.filter(e => e.type === 'japanese').length,
    }

    // トークン情報を取得
    const tokenInfo = aiSession.getTokensInfo()
    if (tokenInfo) {
      console.log('Token usage:', tokenInfo)
    }

    // Popup UIに結果を送信
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETE',
      data: {
        errors: allErrors,
        stats,
        url: data.url,
        tokenInfo,
      },
    })

    return { success: true, data: { errors: allErrors, stats } }
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