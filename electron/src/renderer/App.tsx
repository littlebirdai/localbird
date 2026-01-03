import { useState, useEffect } from 'react'
import { MessageSquare, Grid3X3, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Chat } from '@/components/Chat'
import { Timeline } from '@/components/Timeline'
import { Settings } from '@/components/Settings'
import { TooltipProvider } from '@/components/ui/tooltip'

type View = 'chat' | 'timeline' | 'settings'

export default function App() {
  const [currentView, setCurrentView] = useState<View>('chat')
  const [status, setStatus] = useState<{
    isRunning: boolean
    frameCount: number
  }>({ isRunning: false, frameCount: 0 })

  useEffect(() => {
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

    // Listen for navigation from main process
    const unsubscribe = window.api.onNavigate((path) => {
      if (path === '/settings') setCurrentView('settings')
      else if (path === '/timeline') setCurrentView('timeline')
      else setCurrentView('chat')
    })

    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [])

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <div className="w-16 flex flex-col items-center py-4 border-r bg-muted/30">
          {/* Drag region for window */}
          <div className="h-8 w-full app-drag-region" />

          <nav className="flex flex-col items-center gap-2 mt-4">
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
          {currentView === 'chat' && <Chat />}
          {currentView === 'timeline' && <Timeline />}
          {currentView === 'settings' && <Settings />}
        </main>
      </div>
    </TooltipProvider>
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
