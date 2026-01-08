import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Grid3X3, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Chat } from '@/components/Chat'
import { Timeline } from '@/components/Timeline'
import { Settings } from '@/components/Settings'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { TextStreamChatTransport } from 'ai'

type View = 'chat' | 'timeline' | 'settings'

// Create transport once at module level so it persists
const chatTransport = new TextStreamChatTransport({
  api: 'http://localhost:3001/api/chat'
})

export default function App() {
  // Create runtime at app level so it persists across view changes
  const runtime = useChatRuntime({ transport: chatTransport })

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <AppContent />
      </AssistantRuntimeProvider>
    </TooltipProvider>
  )
}

// Inner component that has access to the AssistantRuntime context
function AppContent() {
  const [currentView, setCurrentView] = useState<View>('chat')
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [status, setStatus] = useState<{
    isRunning: boolean
    frameCount: number
  }>({ isRunning: false, frameCount: 0 })

  // Focus composer input
  const focusComposer = useCallback(() => {
    setCurrentView('chat')
    // Small delay to ensure view has switched
    setTimeout(() => {
      const input = document.querySelector<HTMLTextAreaElement>('[data-composer-input]')
      input?.focus()
    }, 50)
  }, [])

  useEffect(() => {
    // Check if running in Electron (window.api available)
    if (!window.api) {
      console.log('Running in browser mode (no Electron API)')
      return
    }

    // Poll status
    const fetchStatus = async () => {
      try {
        const s = await window.api.getStatus()
        setStatus({ isRunning: s.isRunning, frameCount: s.frameCount })
      } catch (error) {
        console.error('Failed to get status:', error)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)

    // Listen for navigation from main process (Cmd+1/2/3)
    const unsubNavigate = window.api.onNavigate((path) => {
      if (path === '/settings') setCurrentView('settings')
      else if (path === '/timeline') setCurrentView('timeline')
      else setCurrentView('chat')
    })

    return () => {
      clearInterval(interval)
      unsubNavigate()
    }
  }, [])

  // Keyboard shortcuts (Cmd+K to focus, Escape to blur)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K - Focus composer
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        focusComposer()
      }

      // Escape - Blur active element
      if (e.key === 'Escape') {
        const active = document.activeElement as HTMLElement
        if (active && active !== document.body) {
          active.blur()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusComposer])

  // TODO: Chat switching not working - AI SDK's TextStreamChatTransport doesn't support loading historical messages
  // See: https://github.com/assistant-ui/assistant-ui/issues/2365
  // Options to fix:
  // 1. Use ExternalStoreRuntime with custom message state management
  // 2. Wait for AI SDK to add support for message import
  // 3. Build custom runtime that handles persistence
  const handleSelectChat = useCallback((id: string) => {
    setCurrentChatId(id)
    // Currently just tracks selection visually - messages don't load
  }, [])

  const handleNewChat = useCallback(() => {
    setCurrentChatId(null)
    setCurrentView('chat')
  }, [])

  const handleDeleteChat = useCallback(async (id: string) => {
    if (window.api) {
      await window.api.deleteChat(id)
      if (id === currentChatId) {
        setCurrentChatId(null)
      }
    }
  }, [currentChatId])

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - w-[72px] to clear traffic lights */}
      <div className="w-[72px] flex flex-col items-center border-r bg-muted/30">
        {/* Drag region for window - space for traffic lights */}
        <div className="h-14 w-full app-drag-region" />

        <nav className="flex flex-col items-center gap-2 mt-2">
          <NavButton
            icon={<MessageSquare className="w-5 h-5" />}
            active={currentView === 'chat'}
            onClick={() => setCurrentView('chat')}
            label="Chat"
          />
          <NavButton
            icon={<Grid3X3 className="w-5 h-5" />}
            active={currentView === 'timeline'}
            onClick={() => setCurrentView('timeline')}
            label="Timeline"
          />
          <NavButton
            icon={<SettingsIcon className="w-5 h-5" />}
            active={currentView === 'settings'}
            onClick={() => setCurrentView('settings')}
            label="Settings"
          />
        </nav>

        <div className="mt-auto mb-4">
          <div
            className={cn(
              'w-3 h-3 rounded-full',
              status.isRunning ? 'bg-green-500' : 'bg-muted-foreground/30'
            )}
            title={status.isRunning ? `Capturing (${status.frameCount} frames)` : 'Stopped'}
          />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {currentView === 'chat' && (
          <Chat
            currentChatId={currentChatId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
          />
        )}
        {currentView === 'timeline' && <Timeline />}
        {currentView === 'settings' && <Settings />}
      </main>
    </div>
  )
}

function NavButton({
  icon,
  active,
  onClick,
  label
}: {
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      title={label}
    >
      {icon}
    </button>
  )
}
