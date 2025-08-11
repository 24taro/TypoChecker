import { EXTRACTION } from '../shared/constants'

export interface ExtractedText {
  visibleText: string[]
  hiddenText: string[]
  metadata: Map<string, string>
  structuredData: unknown[]
  totalLength: number
}

export class DOMExtractor {
  private processedNodes = new WeakSet<Node>()

  extractPageContent(): ExtractedText {
    const result: ExtractedText = {
      visibleText: [],
      hiddenText: [],
      metadata: new Map(),
      structuredData: [],
      totalLength: 0,
    }

    // メタデータの抽出
    this.extractMetadata(result.metadata)

    // 構造化データの抽出（JSON-LD等）
    this.extractStructuredData(result.structuredData)

    // DOM全体からテキストを抽出
    this.extractTextFromElement(document.body, result)

    // テキストの後処理
    result.visibleText = this.postProcessText(result.visibleText)
    result.hiddenText = this.postProcessText(result.hiddenText)
    
    result.totalLength = 
      result.visibleText.join(' ').length + 
      result.hiddenText.join(' ').length

    return result
  }

  private extractMetadata(metadata: Map<string, string>): void {
    // メタタグから情報を抽出
    document.querySelectorAll('meta[content]').forEach((meta) => {
      const name = (meta as HTMLMetaElement).name || (meta as HTMLMetaElement).getAttribute('property')
      const content = (meta as HTMLMetaElement).content
      
      if (name && content && content.length <= EXTRACTION.MAX_META_LENGTH) {
        metadata.set(name, content)
      }
    })

    // タイトルとdescriptionを確実に含める
    const title = document.title
    if (title) {
      metadata.set('title', title)
    }

    const description = document.querySelector('meta[name="description"]') as HTMLMetaElement
    if (description?.content) {
      metadata.set('description', description.content)
    }
  }

  private extractStructuredData(structuredData: unknown[]): void {
    // JSON-LD構造化データを抽出
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || '')
        structuredData.push(data)
      } catch (e) {
        // パースエラーは無視
        console.debug('Failed to parse JSON-LD:', e)
      }
    })
  }

  private extractTextFromElement(element: Element, result: ExtractedText): void {
    // 無視するタグはスキップ
    if (EXTRACTION.IGNORED_TAGS.includes(element.tagName as typeof EXTRACTION.IGNORED_TAGS[number])) {
      return
    }

    // Shadow DOMのチェック
    if (element.shadowRoot) {
      this.extractTextFromElement(element.shadowRoot as unknown as Element, result)
    }

    // aria-hidden="true"の要素はスキップ
    if (element.getAttribute('aria-hidden') === 'true') {
      return
    }

    // 子要素を再帰的に処理
    const children = Array.from(element.childNodes)
    
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        this.extractTextNode(child, element, result)
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        this.extractTextFromElement(child as Element, result)
      }
    }

    // alt属性、title属性なども抽出
    this.extractAttributes(element, result)
  }

  private extractTextNode(node: Node, parent: Element, result: ExtractedText): void {
    // 既に処理済みのノードはスキップ
    if (this.processedNodes.has(node)) {
      return
    }

    const text = node.textContent?.trim()
    if (!text || text.length < EXTRACTION.MIN_TEXT_LENGTH) {
      return
    }

    this.processedNodes.add(node)

    // 要素の可視性をチェック
    const isVisible = this.isElementVisible(parent)
    
    if (isVisible) {
      result.visibleText.push(text)
    } else {
      result.hiddenText.push(text)
    }
  }

  private extractAttributes(element: Element, result: ExtractedText): void {
    // 画像のalt属性
    if (element.tagName === 'IMG') {
      const alt = element.getAttribute('alt')
      if (alt && alt.length >= EXTRACTION.MIN_TEXT_LENGTH) {
        result.visibleText.push(`[画像: ${alt}]`)
      }
    }

    // inputのplaceholder
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      const placeholder = element.getAttribute('placeholder')
      if (placeholder && placeholder.length >= EXTRACTION.MIN_TEXT_LENGTH) {
        result.visibleText.push(`[入力欄: ${placeholder}]`)
      }
    }

    // title属性
    const title = element.getAttribute('title')
    if (title && title.length >= EXTRACTION.MIN_TEXT_LENGTH && !result.visibleText.includes(title)) {
      result.visibleText.push(`[ツールチップ: ${title}]`)
    }
  }

  private isElementVisible(element: Element): boolean {
    // オフスクリーンの要素も含めて「見える可能性がある」要素として扱う
    const style = window.getComputedStyle(element)
    
    // 明示的に非表示の要素のみfalseとする
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false
    }

    // opacity: 0も非表示とする
    if (style.opacity === '0') {
      return false
    }

    // position: fixed/absoluteで画面外にある要素も可視として扱う
    // （スクロールで表示される可能性があるため）
    
    return true
  }

  private postProcessText(texts: string[]): string[] {
    const processed: string[] = []
    const seen = new Set<string>()

    for (const text of texts) {
      // 重複を除去
      if (seen.has(text)) {
        continue
      }
      seen.add(text)

      // 連続する空白を1つに
      const cleaned = text.replace(/\s+/g, ' ').trim()
      
      if (cleaned.length >= EXTRACTION.MIN_TEXT_LENGTH) {
        processed.push(cleaned)
      }
    }

    return processed
  }

  // ブロック要素ごとにテキストをグループ化（コンテキストを保持）
  extractWithContext(): Map<string, string[]> {
    const contextMap = new Map<string, string[]>()
    
    EXTRACTION.BLOCK_ELEMENTS.forEach(tag => {
      const elements = document.getElementsByTagName(tag)
      Array.from(elements).forEach((element, index) => {
        const text = element.textContent?.trim()
        if (text && text.length >= EXTRACTION.MIN_TEXT_LENGTH) {
          const key = `${tag}_${index}`
          contextMap.set(key, [text])
        }
      })
    })

    return contextMap
  }
}