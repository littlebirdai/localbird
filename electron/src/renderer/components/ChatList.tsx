import { FC, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PlusIcon, TrashIcon, MessageSquareIcon } from 'lucide-react'

interface ChatMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

interface ChatListProps {
  currentChatId: string | null
  onSelectChat: (id: string) => void
  onNewChat: () => void
  onDeleteChat: (id: string) => void
}

export const ChatList: FC<ChatListProps> = ({
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat
}) => {
  const [chats, setChats] = useState<ChatMetadata[]>([])

  useEffect(() => {
    loadChats()
  }, [])

  const loadChats = async () => {
    if (!window.api) return
    const chatList = await window.api.listChats()
    setChats(chatList)
  }

  // Refresh list when current chat changes
  useEffect(() => {
    loadChats()
  }, [currentChatId])

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Yesterday'
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    onDeleteChat(id)
    loadChats()
  }

  return (
    <div className="flex flex-col h-full border-r bg-muted/20">
      <div className="p-3 border-b">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onNewChat}
        >
          <PlusIcon className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={cn(
                  'w-full group flex items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors',
                  currentChatId === chat.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                )}
              >
                <MessageSquareIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {chat.title || 'New Chat'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(chat.updatedAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, chat.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-opacity"
                >
                  <TrashIcon className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
