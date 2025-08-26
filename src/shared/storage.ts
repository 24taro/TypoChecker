// Chrome Storage API wrapper for API Key management

export type AIProvider = 'chrome-ai' | 'gemini-api'

export interface StorageData {
  geminiApiKey?: string
  aiProvider?: AIProvider
}

export class StorageManager {
  private static readonly STORAGE_KEY = 'typoChecker'

  static async getApiKey(): Promise<string | null> {
    const data = await this.getData()
    return data.geminiApiKey || null
  }

  static async setApiKey(apiKey: string): Promise<void> {
    const data = await this.getData()
    data.geminiApiKey = apiKey
    await this.setData(data)
  }

  static async clearApiKey(): Promise<void> {
    const data = await this.getData()
    delete data.geminiApiKey
    await this.setData(data)
  }
  
  static async getAIProvider(): Promise<AIProvider> {
    const data = await this.getData()
    return data.aiProvider || 'chrome-ai' // デフォルトはChrome AI
  }
  
  static async setAIProvider(provider: AIProvider): Promise<void> {
    const data = await this.getData()
    data.aiProvider = provider
    await this.setData(data)
  }

  private static async getData(): Promise<StorageData> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.STORAGE_KEY, (result) => {
        resolve(result[this.STORAGE_KEY] || {})
      })
    })
  }

  private static async setData(data: StorageData): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: data }, () => {
        resolve()
      })
    })
  }
}