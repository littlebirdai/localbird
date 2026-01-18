import { useState, useEffect } from 'react'
import { Save, Check, AlertCircle, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SettingsData {
  geminiAPIKey: string
  claudeAPIKey: string
  openaiAPIKey: string
  captureInterval: number
  enableFullScreenCaptures: boolean
  fullScreenCaptureInterval: number
  activeVisionProvider: string
  chatProvider: string
  autoStartCapture: boolean
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsData>({
    geminiAPIKey: '',
    claudeAPIKey: '',
    openaiAPIKey: '',
    captureInterval: 5,
    enableFullScreenCaptures: true,
    fullScreenCaptureInterval: 1,
    activeVisionProvider: 'gemini',
    chatProvider: 'anthropic',
    autoStartCapture: true
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [qdrantStatus, setQdrantStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [captureStatus, setCaptureStatus] = useState<{ isRunning: boolean; frameCount: number }>({
    isRunning: false,
    frameCount: 0
  })

  useEffect(() => {
    loadSettings()
    checkQdrant()
    loadCaptureStatus()

    const captureInterval = setInterval(loadCaptureStatus, 5000)
    const qdrantInterval = setInterval(checkQdrant, 3000)
    return () => {
      clearInterval(captureInterval)
      clearInterval(qdrantInterval)
    }
  }, [])

  const loadSettings = async () => {
    try {
      const data = await window.api.getSettings()
      setSettings(data)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const loadCaptureStatus = async () => {
    try {
      const status = await window.api.getStatus()
      setCaptureStatus({ isRunning: status.isRunning, frameCount: status.frameCount })
    } catch (error) {
      console.error('Failed to get capture status:', error)
    }
  }

  const checkQdrant = async () => {
    setQdrantStatus('checking')
    try {
      const isConnected = await window.api.checkQdrant()
      console.log('[Settings] checkQdrant result:', isConnected)
      setQdrantStatus(isConnected ? 'connected' : 'disconnected')
    } catch (error) {
      console.error('[Settings] checkQdrant error:', error)
      setQdrantStatus('disconnected')
    }
  }

  const saveSettings = async () => {
    setIsSaving(true)
    setSaveStatus('idle')
    try {
      await window.api.saveSettings(settings)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error) {
      console.error('Failed to save settings:', error)
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleCapture = async () => {
    try {
      if (captureStatus.isRunning) {
        await window.api.stopCapture()
      } else {
        await window.api.startCapture()
      }
      loadCaptureStatus()
    } catch (error) {
      console.error('Failed to toggle capture:', error)
    }
  }

  const updateSetting = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure Localbird preferences</p>
        </div>

        {/* Capture Status */}
        <Section title="Capture">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div>
              <p className="font-medium">
                {captureStatus.isRunning ? 'Capturing' : 'Stopped'}
              </p>
              <p className="text-sm text-muted-foreground">
                {captureStatus.frameCount} frames captured
              </p>
            </div>
            <Button
              onClick={toggleCapture}
              variant={captureStatus.isRunning ? 'destructive' : 'default'}
            >
              {captureStatus.isRunning ? (
                <>
                  <Square className="w-4 h-4 mr-2" /> Stop
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" /> Start
                </>
              )}
            </Button>
          </div>

          <Field label="Capture Interval (seconds)">
            <input
              type="number"
              min="1"
              max="60"
              value={settings.captureInterval}
              onChange={(e) => updateSetting('captureInterval', Number(e.target.value))}
              className="w-24 px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <Field label="Auto-start capture on launch">
            <Toggle
              checked={settings.autoStartCapture}
              onChange={(checked) => updateSetting('autoStartCapture', checked)}
            />
          </Field>

          <div className="pt-4 border-t">
            <Field label="Full Screen Captures" hint="Periodically capture the entire screen for additional context">
              <Toggle
                checked={settings.enableFullScreenCaptures}
                onChange={(checked) => updateSetting('enableFullScreenCaptures', checked)}
              />
            </Field>

            {settings.enableFullScreenCaptures && (
              <div className="mt-4 ml-4">
                <Field label="Full Screen Interval (seconds)">
                  <input
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={settings.fullScreenCaptureInterval}
                    onChange={(e) => updateSetting('fullScreenCaptureInterval', Number(e.target.value))}
                    className="w-24 px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </Field>
              </div>
            )}
          </div>
        </Section>

        {/* API Keys */}
        <Section title="API Keys">
          <Field label="Gemini API Key" hint="Recommended for vision analysis">
            <input
              type="password"
              value={settings.geminiAPIKey}
              onChange={(e) => updateSetting('geminiAPIKey', e.target.value)}
              placeholder="Enter your Gemini API key"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <Field label="Claude API Key">
            <input
              type="password"
              value={settings.claudeAPIKey}
              onChange={(e) => updateSetting('claudeAPIKey', e.target.value)}
              placeholder="Enter your Claude API key"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <Field label="OpenAI API Key">
            <input
              type="password"
              value={settings.openaiAPIKey}
              onChange={(e) => updateSetting('openaiAPIKey', e.target.value)}
              placeholder="Enter your OpenAI API key"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
        </Section>

        {/* Providers */}
        <Section title="AI Providers">
          <Field label="Vision Provider" hint="Used for analyzing screenshots">
            <select
              value={settings.activeVisionProvider}
              onChange={(e) => updateSetting('activeVisionProvider', e.target.value)}
              className="px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="gemini">Google Gemini</option>
              <option value="claude">Anthropic Claude</option>
              <option value="openai">OpenAI</option>
            </select>
          </Field>

          <Field label="Chat Provider" hint="Used for conversation">
            <select
              value={settings.chatProvider}
              onChange={(e) => updateSetting('chatProvider', e.target.value)}
              className="px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="anthropic">Anthropic Claude</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </Field>
        </Section>

        {/* Vector Database */}
        <Section title="Vector Database">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-3 h-3 rounded-full',
                  qdrantStatus === 'connected' && 'bg-green-500',
                  qdrantStatus === 'disconnected' && 'bg-red-500',
                  qdrantStatus === 'checking' && 'bg-yellow-500 animate-pulse'
                )}
              />
              <div>
                <p className="font-medium">Qdrant</p>
                <p className="text-sm text-muted-foreground">
                  {qdrantStatus === 'connected' && 'Connected to localhost:6333'}
                  {qdrantStatus === 'disconnected' && 'Not connected'}
                  {qdrantStatus === 'checking' && 'Checking...'}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={checkQdrant}>
              Check
            </Button>
          </div>

          {qdrantStatus === 'disconnected' && (
            <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10">
              <div className="flex gap-2 text-destructive">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Qdrant not running</p>
                  <p className="mt-1 text-destructive/80">
                    Start Qdrant with:{' '}
                    <code className="px-1 py-0.5 rounded bg-destructive/20">
                      docker run -p 6333:6333 qdrant/qdrant
                    </code>
                  </p>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={saveSettings} disabled={isSaving}>
            {saveStatus === 'success' ? (
              <>
                <Check className="w-4 h-4 mr-2" /> Saved
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" /> Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}
