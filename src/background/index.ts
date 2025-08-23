import { AIManager } from './ai/ai-manager'
import type { PageContentMessage, Message } from '../shared/types/messages'
import type { ContentLevel } from '../shared/types/settings'
import type { TokenInfo } from './ai/ai-provider'

console.log('Page AI Assistant Service Worker started')

const aiManager = new AIManager()

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Page AI Assistant extension installed')
  } else if (details.reason === 'update') {
    console.log('Page AI Assistant extension updated')
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message)
  
  switch (message.type) {
    case 'CHECK_AI_AVAILABILITY':
      aiManager.checkAvailability()
        .then((availability) => {
          sendResponse({ 
            availability: availability.primary ? 'readily' : 'no',
            details: availability 
          })
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
      handleModelDownload()
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

    // AI Managerを初期化
    await aiManager.initialize()

    // テキストを分析（デフォルトプロンプト）
    const analysisResult = await aiManager.analyzeContent('このページの内容を分析してください', data.text)

    // Popup UIに結果を送信
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETE',
      data: {
        fullText: analysisResult.result,
        url: data.url,
        provider: analysisResult.provider,
        tokenInfo: analysisResult.tokenInfo,
      },
    })

    return { success: true, data: analysisResult.result }
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

async function handleModelDownload(): Promise<void> {
  try {
    await aiManager.initialize()
    const currentProvider = aiManager.getCurrentProvider()
    
    if (currentProvider && 'initiateModelDownload' in currentProvider) {
      const chromeNanoProvider = currentProvider as any
      await chromeNanoProvider.initiateModelDownload()
    } else {
      throw new Error('Model download is only available for Chrome built-in AI')
    }
  } catch (error) {
    console.error('Model download failed:', error)
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

function processContentByLevel(contentLevel: ContentLevel, html: string): string {
  try {
    switch (contentLevel) {
      case 'text-only':
        // 重要度を加味したマークダウン変換
        return htmlToMarkdown(html, true)

      case 'html-only':
        // HTML構造のみ（CSS・JavaScriptを除去）
        return html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/\s+(on\w+)="[^"]*"/gi, '')
          .replace(/\s+(data-[\w-]+)="[^"]*"/gi, '')
          .replace(/\s+style="[^"]*"/gi, '') // インラインCSSも除去
          .replace(/\n\s+/g, '\n')
          .replace(/\s{3,}/g, '  ')
          .replace(/\n{2,}/g, '\n')
          .trim()

      case 'html-css':
        // HTML + CSS（JavaScript除去）
        return html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<!--(?!\s*\[if)(?!.*?<!\[endif\])[\s\S]*?-->/g, '')
          .replace(/\s+(on\w+)="[^"]*"/gi, '')
          .replace(/\s+(data-[\w-]+)="[^"]*"/gi, '')
          .replace(/\n\s+/g, '\n')
          .replace(/\s{3,}/g, '  ')
          .replace(/\n{2,}/g, '\n')
          .trim()

      case 'html-css-js':
        // 全て含む（最小限の最適化のみ）
        return html
          .replace(/<!--(?!\s*\[if)(?!.*?<!\[endif\])[\s\S]*?-->/g, '')
          .replace(/\n\s+/g, '\n')
          .replace(/\s{3,}/g, '  ')
          .replace(/\n{2,}/g, '\n')
          .trim()

      default:
        console.warn('Unknown content level, using html-css as default:', contentLevel)
        return processContentByLevel('html-css', html)
    }
  } catch (error) {
    console.warn('Content processing failed, using original:', error)
    return html
  }
}

function htmlToMarkdown(html: string, textOnly = false): string {
  try {
    if (!textOnly) {
      return html
    }

    let processedHtml = html

    // 低重要度要素を除去
    const lowPriorityElements = [
      /<nav\b[^>]*>[\s\S]*?<\/nav>/gi,
      /<footer\b[^>]*>[\s\S]*?<\/footer>/gi,
      /<aside\b[^>]*>[\s\S]*?<\/aside>/gi,
      /<header\s+class="[^"]*site-header[^"]*"[^>]*>[\s\S]*?<\/header>/gi,
      /<div\s+class="[^"]*navigation[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      /<div\s+class="[^"]*menu[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      /<div\s+class="[^"]*sidebar[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      /<div\s+class="[^"]*ads?[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      /<div\s+class="[^"]*advertisement[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      /<div\s+class="[^"]*social-share[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      /<div\s+class="[^"]*comments[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      /<div\s+class="[^"]*related-posts[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    ]

    // 低重要度要素を除去
    lowPriorityElements.forEach(regex => {
      processedHtml = processedHtml.replace(regex, '')
    })

    // スクリプトとスタイルを除去
    processedHtml = processedHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')

    let markdown = ''

    // タイトルの抽出
    const titleMatch = processedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim()
      if (title) {
        markdown += `# ${title}\n\n`
      }
    }

    // メタデスクリプションの抽出
    const descMatch = processedHtml.match(/<meta\s+name="description"\s+content="([^"]*)"[^>]*>/i)
    if (descMatch && descMatch[1]) {
      const description = descMatch[1].trim()
      if (description) {
        markdown += `> ${description}\n\n`
      }
    }

    // 見出しの変換 (h1-h6)
    for (let i = 6; i >= 1; i--) {
      const headingRegex = new RegExp(`<h${i}[^>]*>([\\s\\S]*?)<\\/h${i}>`, 'gi')
      const headingMarker = '#'.repeat(i)
      processedHtml = processedHtml.replace(headingRegex, (match, content) => {
        const text = extractTextContent(content).trim()
        return text ? `\n${headingMarker} ${text}\n\n` : ''
      })
    }

    // 段落の変換
    processedHtml = processedHtml.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (match, content) => {
      const text = convertInlineElementsToMarkdown(content).trim()
      return text ? `${text}\n\n` : ''
    })

    // 引用の変換
    processedHtml = processedHtml.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, content) => {
      const text = extractTextContent(content).trim()
      return text ? `> ${text}\n\n` : ''
    })

    // 順序なしリストの変換
    processedHtml = processedHtml.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
      return convertListToMarkdown(content, '- ')
    })

    // 順序ありリストの変換
    processedHtml = processedHtml.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
      return convertListToMarkdown(content, '1. ', true)
    })

    // preタグの変換
    processedHtml = processedHtml.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (match, content) => {
      const text = extractTextContent(content).trim()
      return text ? `\n\`\`\`\n${text}\n\`\`\`\n\n` : ''
    })

    // インライン要素の変換
    processedHtml = convertInlineElementsToMarkdown(processedHtml)

    // 残りのHTMLタグを除去してテキストに変換
    markdown += extractTextContent(processedHtml)

    // マークダウンの後処理
    return markdown
      .replace(/\n{3,}/g, '\n\n') // 連続する改行を2つまでに制限
      .replace(/^\s+|\s+$/gm, '') // 各行の前後の空白を除去
      .replace(/\s+/g, ' ') // 連続空白を単一に
      .trim()

  } catch (error) {
    console.warn('Markdown conversion failed, falling back to text extraction:', error)
    // フォールバック：シンプルなテキスト抽出
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
}

function convertInlineElementsToMarkdown(html: string): string {
  // 強調（strong, b）
  html = html.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (match, content) => {
    const text = extractTextContent(content).trim()
    return text ? `**${text}**` : ''
  })

  // 斜体（em, i）
  html = html.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (match, content) => {
    const text = extractTextContent(content).trim()
    return text ? `*${text}*` : ''
  })

  // インラインコード
  html = html.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (match, content) => {
    const text = extractTextContent(content).trim()
    return text ? `\`${text}\`` : ''
  })

  // リンク
  html = html.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, content) => {
    const text = extractTextContent(content).trim()
    return text && href ? `[${text}](${href})` : text || ''
  })

  // 画像
  html = html.replace(/<img\s+[^>]*src="([^"]*)"[^>]*(?:alt="([^"]*)"[^>]*)?[^>]*>/gi, (match, src, alt) => {
    return src ? `![${alt || ''}](${src})` : ''
  })

  // 改行
  html = html.replace(/<br\s*\/?>/gi, '\n')

  return html
}

function convertListToMarkdown(listContent: string, marker: string, ordered = false): string {
  let markdown = ''
  let counter = 1

  // li要素を抽出
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let match

  while ((match = liRegex.exec(listContent)) !== null) {
    const itemContent = match[1]
    const text = convertInlineElementsToMarkdown(itemContent)
    const cleanText = extractTextContent(text).trim()
    
    if (cleanText) {
      const listMarker = ordered ? `${counter}. ` : marker
      markdown += `${listMarker}${cleanText}\n`
      if (ordered) counter++
    }
  }

  return markdown ? `\n${markdown}\n` : ''
}

function extractTextContent(html: string): string {
  // HTMLタグを全て除去してテキストのみを抽出
  return html
    .replace(/<[^>]+>/g, '') // HTMLタグを除去
    .replace(/&nbsp;/g, ' ') // &nbsp;をスペースに
    .replace(/&amp;/g, '&')  // &amp;を&に
    .replace(/&lt;/g, '<')   // &lt;を<に
    .replace(/&gt;/g, '>')   // &gt;を>に
    .replace(/&quot;/g, '"') // &quot;を"に
    .replace(/&#39;/g, "'")  // &#39;を'に
    .replace(/\s+/g, ' ')    // 連続空白を単一に
    .trim()
}

async function processAnalysis(
  data: { url: string; title: string; html: string },
  userPrompt: string,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  try {
    const htmlLength = data.html?.length || 0
    console.log('Processing analysis for:', {
      url: data.url,
      htmlLength,
    })

    // AI Managerを初期化してsettingsを取得
    await aiManager.initialize()
    const settings = aiManager.getSettings()
    
    // contentLevelに基づいてコンテンツを処理
    const processedContent = processContentByLevel(settings.contentLevel, data.html)
    const processedLength = processedContent.length
    const reductionPercent = ((htmlLength - processedLength) / htmlLength * 100).toFixed(1)
    
    console.log(`Content processing (${settings.contentLevel}): ${htmlLength} → ${processedLength} bytes (${reductionPercent}% reduced)`)

    // 処理後のサイズをチェック（Gemini 2.5の制限に基づく）
    const MAX_SAFE_SIZE = 3.5 * 1024 * 1024 // 約875,000トークン相当（1Mトークン制限の余裕）
    
    if (processedLength > MAX_SAFE_SIZE) {
      const sizeMB = (processedLength / 1024 / 1024).toFixed(2)
      const maxSizeMB = (MAX_SAFE_SIZE / 1024 / 1024).toFixed(2)
      const originalSizeMB = (htmlLength / 1024 / 1024).toFixed(2)
      
      throw new Error(`ページのコンテンツが大きすぎるため処理できません。\n元サイズ: ${originalSizeMB}MB → 処理後: ${sizeMB}MB\n推奨最大サイズ: ${maxSizeMB}MB\n\nより小さなページでお試しください。`)
    }

    // ストリーミング開始を通知
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_STREAM_START',
      data: {
        message: 'AI処理を実行中...'
      }
    })

    // AI処理をストリーミングで実行
    let providerName = 'Unknown'
    let fullAnalysisResult = ''
    let finalTokenInfo: TokenInfo | undefined = undefined
    
    // プロバイダー名を事前に取得
    const currentProvider = aiManager.getCurrentProvider()
    if (currentProvider) {
      providerName = currentProvider.getProviderName()
      console.log('Initial provider name:', providerName)
    } else {
      console.log('No provider found at start')
    }
    
    await aiManager.analyzeContentStream(userPrompt, processedContent, {
      onChunk: (chunk) => {
        // チャンクを受信したらポップアップに送信
        chrome.runtime.sendMessage({
          type: 'ANALYSIS_STREAM_CHUNK',
          data: {
            chunk: chunk.text
          }
        })
        fullAnalysisResult += chunk.text
      },
      onComplete: (fullText, tokenInfo) => {
        fullAnalysisResult = fullText
        finalTokenInfo = tokenInfo
        
        // 完了時に最新のプロバイダー名を取得（フォールバックの場合に変わる可能性があるため）
        const finalProvider = aiManager.getCurrentProvider()
        if (finalProvider) {
          providerName = finalProvider.getProviderName()
          // フォールバック時の特別な表示
          if (providerName.includes('Chrome Built-in AI') && currentProvider?.getProviderName().includes('Gemini')) {
            providerName += ' (fallback)'
          }
        }
        
        console.log('Analysis completed, sending ANALYSIS_STREAM_END with:')
        console.log('- provider:', providerName)
        console.log('- tokenInfo:', finalTokenInfo)
        console.log('- fullTextLength:', fullText.length)
        console.log('- currentProviderName:', finalProvider?.getProviderName())
        console.log('- originalProviderName:', currentProvider?.getProviderName())
        
        // 完了時に最終結果を送信
        chrome.runtime.sendMessage({
          type: 'ANALYSIS_STREAM_END',
          data: {
            fullText,
            provider: providerName,
            tokenInfo
          }
        })
      },
      onError: (error) => {
        chrome.runtime.sendMessage({
          type: 'ANALYSIS_STREAM_ERROR',
          data: {
            message: error.message,
            error: error.code || 'UNKNOWN_ERROR'
          }
        })
        throw error
      }
    })
    
    console.log('Analysis completed:', {
      provider: providerName,
      resultLength: fullAnalysisResult.length,
      tokenInfo: finalTokenInfo
    })

  } catch (error) {
    console.error('Analysis error:', error)
    
    let errorMessage = '処理中にエラーが発生しました'
    let errorCode = 'UNKNOWN_ERROR'
    
    if (error && typeof error === 'object' && 'code' in error) {
      errorCode = error.code as string
      const message = 'message' in error ? (error.message as string) : errorMessage
      errorMessage = message || errorMessage
    } else if (error instanceof Error) {
      if (error.message.includes('too large') || error.message.includes('QuotaExceededError') || error.name === 'QuotaExceededError') {
        errorMessage = 'ページのHTMLが大きすぎるため処理できません。より短いページでお試しください。'
        errorCode = 'CONTENT_TOO_LARGE'
      } else {
        errorMessage = error.message
      }
    }
    
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_ERROR',
      data: {
        message: errorMessage,
        code: errorCode,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
    
    throw error
  }
}