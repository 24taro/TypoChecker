import type { AISettings, AIProvider, GeminiModel, ContentLevel } from '../shared/types/settings'
import { DEFAULT_AI_SETTINGS, GEMINI_MODELS, CONTENT_LEVELS } from '../shared/types/settings'

class OptionsManager {
  private providerGeminiRadio!: HTMLInputElement
  private providerChromeRadio!: HTMLInputElement
  private apiKeyInput!: HTMLInputElement
  private toggleApiKeyBtn!: HTMLButtonElement
  private geminiModelSelect!: HTMLSelectElement
  private fallbackNanoCheckbox!: HTMLInputElement
  private testConnectionBtn!: HTMLButtonElement
  private testResultDiv!: HTMLElement
  private saveSettingsBtn!: HTMLButtonElement
  private resetSettingsBtn!: HTMLButtonElement
  private saveStatusDiv!: HTMLElement
  private geminiSettingsSection!: HTMLElement
  private contentLevelRadios!: NodeListOf<HTMLInputElement>

  private currentSettings: AISettings = { ...DEFAULT_AI_SETTINGS }

  constructor() {
    this.initializeElements()
    this.setupEventListeners()
    this.loadSettings()
  }

  private initializeElements(): void {
    this.providerGeminiRadio = document.getElementById('provider-gemini') as HTMLInputElement
    this.providerChromeRadio = document.getElementById('provider-chrome') as HTMLInputElement
    this.apiKeyInput = document.getElementById('api-key') as HTMLInputElement
    this.toggleApiKeyBtn = document.getElementById('toggle-api-key') as HTMLButtonElement
    this.geminiModelSelect = document.getElementById('gemini-model') as HTMLSelectElement
    this.fallbackNanoCheckbox = document.getElementById('fallback-nano') as HTMLInputElement
    this.testConnectionBtn = document.getElementById('test-connection') as HTMLButtonElement
    this.testResultDiv = document.getElementById('test-result') as HTMLElement
    this.saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement
    this.resetSettingsBtn = document.getElementById('reset-settings') as HTMLButtonElement
    this.saveStatusDiv = document.getElementById('save-status') as HTMLElement
    this.geminiSettingsSection = document.querySelector('.gemini-settings') as HTMLElement
    this.contentLevelRadios = document.querySelectorAll('input[name="content-level"]') as NodeListOf<HTMLInputElement>
  }

  private setupEventListeners(): void {
    // プロバイダー選択
    this.providerGeminiRadio.addEventListener('change', () => this.handleProviderChange())
    this.providerChromeRadio.addEventListener('change', () => this.handleProviderChange())

    // APIキー表示切替
    this.toggleApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility())

    // フォーム変更の監視
    this.apiKeyInput.addEventListener('input', () => this.handleFormChange())
    this.geminiModelSelect.addEventListener('change', () => this.handleFormChange())
    this.fallbackNanoCheckbox.addEventListener('change', () => this.handleFormChange())
    this.contentLevelRadios.forEach(radio => {
      radio.addEventListener('change', () => this.handleFormChange())
    })

    // ボタンイベント
    this.testConnectionBtn.addEventListener('click', () => this.testConnection())
    this.saveSettingsBtn.addEventListener('click', () => this.saveSettings())
    this.resetSettingsBtn.addEventListener('click', () => this.resetToDefaults())
  }

  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['aiSettings'])
      this.currentSettings = {
        ...DEFAULT_AI_SETTINGS,
        ...result.aiSettings,
      }

      this.updateUI()
      console.log('Settings loaded:', this.currentSettings)
    } catch (error) {
      console.error('Failed to load settings:', error)
      this.showSaveStatus('設定の読み込みに失敗しました', 'error')
    }
  }

  private updateUI(): void {
    // プロバイダー選択
    if (this.currentSettings.provider === 'gemini-api') {
      this.providerGeminiRadio.checked = true
    } else {
      this.providerChromeRadio.checked = true
    }

    // APIキー
    this.apiKeyInput.value = this.currentSettings.geminiApiKey || ''

    // モデル選択
    this.geminiModelSelect.value = this.currentSettings.geminiModel

    // フォールバック設定
    this.fallbackNanoCheckbox.checked = this.currentSettings.fallbackToChromeNano

    // コンテンツレベル設定
    this.contentLevelRadios.forEach(radio => {
      radio.checked = radio.value === this.currentSettings.contentLevel
    })

    this.handleProviderChange()
    this.validateForm()
  }

  private handleProviderChange(): void {
    const isGeminiSelected = this.providerGeminiRadio.checked

    // Gemini設定の表示/非表示
    if (isGeminiSelected) {
      this.geminiSettingsSection.classList.remove('hidden')
    } else {
      this.geminiSettingsSection.classList.add('hidden')
    }

    this.validateForm()
  }

  private handleFormChange(): void {
    this.validateForm()
    this.clearTestResult()
  }

  private validateForm(): void {
    const isGeminiSelected = this.providerGeminiRadio.checked
    const hasApiKey = this.apiKeyInput.value.trim().length > 0

    // テストボタンの有効/無効
    this.testConnectionBtn.disabled = isGeminiSelected && !hasApiKey

    // 保存ボタンの有効/無効
    this.saveSettingsBtn.disabled = isGeminiSelected && !hasApiKey

    // APIキーが入力された場合の警告クリア
    if (hasApiKey && isGeminiSelected) {
      this.clearSaveStatus()
    }
  }

  private toggleApiKeyVisibility(): void {
    if (this.apiKeyInput.type === 'password') {
      this.apiKeyInput.type = 'text'
      this.toggleApiKeyBtn.classList.add('showing')
    } else {
      this.apiKeyInput.type = 'password'
      this.toggleApiKeyBtn.classList.remove('showing')
    }
  }

  private async testConnection(): Promise<void> {
    const apiKey = this.apiKeyInput.value.trim()
    const model = this.geminiModelSelect.value as GeminiModel

    if (!apiKey) {
      this.showTestResult('APIキーを入力してください', 'error')
      return
    }

    this.showTestResult('接続をテストしています...', 'loading')
    this.testConnectionBtn.disabled = true

    try {
      const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const requestBody = {
        contents: [{
          parts: [{
            text: 'テスト接続: 「こんにちは」と返答してください。'
          }]
        }],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.1
        }
      }
      
      const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
      console.log('Making API request to:', endpointUrl)
      console.log('Request body:', JSON.stringify(requestBody, null, 2))
      console.log('Using x-goog-api-key header authentication')
      
      // まずヘッダー認証を試行
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody)
      })
      
      console.log('Response status:', response.status)
      console.log('Response headers:', Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        let errorMessage = 'APIエラーが発生しました'
        let errorDetails = ''
        
        try {
          const responseText = await response.text()
          console.log('Error response text:', responseText)
          
          try {
            const errorData = JSON.parse(responseText)
            if (errorData.error?.message) {
              errorDetails = `: ${errorData.error.message}`
            }
          } catch (parseError) {
            console.log('Failed to parse error response as JSON:', parseError)
            // JSONでない場合はテキストをそのまま使用
            errorDetails = `: ${responseText}`
          }
        } catch (textError) {
          console.log('Failed to read response text:', textError)
        }
        
        switch (response.status) {
          case 400:
            errorMessage = 'リクエストが不正です（モデル名またはリクエスト形式を確認してください）'
            break
          case 401:
            errorMessage = 'APIキーが無効または期限切れです'
            break
          case 403:
            errorMessage = 'APIアクセスが拒否されました（APIキーの権限を確認してください）'
            break
          case 404:
            errorMessage = '指定されたモデルが見つかりません'
            break
          case 429:
            errorMessage = 'APIリクエスト制限に達しました'
            break
          case 500:
            errorMessage = 'Gemini APIサーバーエラーです'
            break
        }
        
        throw new Error(`${errorMessage}${errorDetails} (${response.status})`)
      }

      const data = await response.json()
      console.log('Gemini API Response:', data) // デバッグ用ログ
      
      // レスポンスの基本構造をチェック
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('APIレスポンスに候補が含まれていません')
      }
      
      const candidate = data.candidates[0]
      
      // 完了理由をチェック
      if (candidate.finishReason === 'MAX_TOKENS') {
        // トークン制限に達した場合でも接続は成功とみなす
        const modelName = GEMINI_MODELS[model]?.name || model
        this.showTestResult(`✓ 接続成功！ ${modelName} が正常に動作しています。`, 'success')
        return
      }
      
      // レスポンステキストを取得
      const responseText = candidate.content?.parts?.[0]?.text

      if (responseText && responseText.trim()) {
        const modelName = GEMINI_MODELS[model]?.name || model
        this.showTestResult(`✓ 接続成功！ ${modelName}: ${responseText.substring(0, 20)}...`, 'success')
      } else if (candidate.finishReason === 'STOP') {
        // 正常終了だがテキストがない場合
        const modelName = GEMINI_MODELS[model]?.name || model
        this.showTestResult(`✓ 接続成功！ ${modelName} が正常に動作しています。`, 'success')
      } else {
        // その他の場合は詳細情報を表示
        console.error('Unexpected response structure:', data)
        
        // エラーが含まれている場合の処理
        if (data.error) {
          throw new Error(`API エラー: ${data.error.message}`)
        }
        
        throw new Error(`予期しないレスポンス形式: ${candidate.finishReason || 'UNKNOWN_REASON'}`)
      }

    } catch (error) {
      console.error('Connection test failed:', error)
      const errorMessage = error instanceof Error ? error.message : '不明なエラーです'
      this.showTestResult(`✗ 接続失敗: ${errorMessage}`, 'error')
    } finally {
      this.testConnectionBtn.disabled = false
    }
  }

  private async saveSettings(): Promise<void> {
    const selectedContentLevel = Array.from(this.contentLevelRadios).find(radio => radio.checked)?.value as ContentLevel || 'html-css'
    
    const newSettings: AISettings = {
      provider: this.providerGeminiRadio.checked ? 'gemini-api' : 'chrome-nano',
      geminiApiKey: this.apiKeyInput.value.trim() || undefined,
      geminiModel: this.geminiModelSelect.value as GeminiModel,
      fallbackToChromeNano: this.fallbackNanoCheckbox.checked,
      contentLevel: selectedContentLevel,
    }

    try {
      await chrome.storage.sync.set({ aiSettings: newSettings })
      this.currentSettings = newSettings
      this.showSaveStatus('✓ 設定を保存しました', 'success')
      console.log('Settings saved:', newSettings)
    } catch (error) {
      console.error('Failed to save settings:', error)
      this.showSaveStatus('✗ 設定の保存に失敗しました', 'error')
    }
  }

  private async resetToDefaults(): Promise<void> {
    if (confirm('設定をデフォルトに戻しますか？')) {
      try {
        await chrome.storage.sync.set({ aiSettings: DEFAULT_AI_SETTINGS })
        this.currentSettings = { ...DEFAULT_AI_SETTINGS }
        this.updateUI()
        this.showSaveStatus('✓ デフォルト設定に戻しました', 'success')
      } catch (error) {
        console.error('Failed to reset settings:', error)
        this.showSaveStatus('✗ 設定のリセットに失敗しました', 'error')
      }
    }
  }

  private showTestResult(message: string, type: 'success' | 'error' | 'loading'): void {
    this.testResultDiv.textContent = message
    this.testResultDiv.className = `test-result ${type}`
  }

  private clearTestResult(): void {
    this.testResultDiv.textContent = ''
    this.testResultDiv.className = 'test-result'
  }

  private showSaveStatus(message: string, type: 'success' | 'error'): void {
    this.saveStatusDiv.textContent = message
    this.saveStatusDiv.className = `status-message ${type}`

    // 成功メッセージは3秒後に自動クリア
    if (type === 'success') {
      setTimeout(() => this.clearSaveStatus(), 3000)
    }
  }

  private clearSaveStatus(): void {
    this.saveStatusDiv.textContent = ''
    this.saveStatusDiv.className = 'status-message'
  }
}

// オプションページの初期化
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager()
})