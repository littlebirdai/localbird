import { Thread } from './assistant-ui/thread'
import { ChatList } from './ChatList'

interface ChatProps {
  currentChatId: string | null
  onSelectChat: (id: string) => void
  onNewChat: () => void
  onDeleteChat: (id: string) => void
}

export function Chat({ currentChatId, onSelectChat, onNewChat, onDeleteChat }: ChatProps) {
  return (
    <div className="flex h-full">
      <div className="w-64 flex-shrink-0">
        <ChatList
          currentChatId={currentChatId}
          onSelectChat={onSelectChat}
          onNewChat={onNewChat}
          onDeleteChat={onDeleteChat}
        />
      </div>
      <div className="flex-1 min-w-0">
        <Thread />
      </div>
    </div>
  )
}
