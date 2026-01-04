import { Thread } from './assistant-ui/thread'
import { ChatList } from './ChatList'
import { useChatPersistence } from '@/hooks/useChatPersistence'

export function Chat() {
  const { currentChatId, loadChat, newChat, deleteChat } = useChatPersistence()

  return (
    <div className="flex h-full">
      <div className="w-64 flex-shrink-0">
        <ChatList
          currentChatId={currentChatId}
          onSelectChat={loadChat}
          onNewChat={newChat}
          onDeleteChat={deleteChat}
        />
      </div>
      <div className="flex-1 min-w-0">
        <Thread />
      </div>
    </div>
  )
}
