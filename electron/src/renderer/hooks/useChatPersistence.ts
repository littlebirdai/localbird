import { useCallback, useEffect, useRef, useState } from 'react'
import { useThreadRuntime, useAssistantRuntime } from '@assistant-ui/react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

interface Chat {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export function useChatPersistence() {
  const threadRuntime = useThreadRuntime()
  const assistantRuntime = useAssistantRuntime()
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastMessageCountRef = useRef(0)

  // Generate a unique ID
  const generateId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // Extract title from first user message
  const extractTitle = (messages: ChatMessage[]): string => {
    const firstUserMessage = messages.find(m => m.role === 'user')
    if (!firstUserMessage) return 'New Chat'
    const content = firstUserMessage.content
    // Truncate to first 50 chars or first line
    const firstLine = content.split('\n')[0]
    return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine
  }

  // Convert thread messages to our format
  const convertMessages = (): ChatMessage[] => {
    const state = threadRuntime.getState()
    return state.messages.map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content
        .filter(p => p.type === 'text')
        .map(p => (p as { type: 'text'; text: string }).text)
        .join(''),
      createdAt: m.createdAt?.getTime() || Date.now()
    }))
  }

  // Save current chat
  const saveChat = useCallback(async () => {
    if (!window.api) return

    const messages = convertMessages()
    if (messages.length === 0) return

    const id = currentChatId || generateId()
    const existingChat = currentChatId ? await window.api.getChat(currentChatId) : null

    const chat: Chat = {
      id,
      title: existingChat?.title || extractTitle(messages),
      createdAt: existingChat?.createdAt || Date.now(),
      updatedAt: Date.now(),
      messages
    }

    await window.api.saveChat(chat)

    if (!currentChatId) {
      setCurrentChatId(id)
    }
  }, [currentChatId, threadRuntime])

  // Debounced save after message changes
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveChat()
    }, 1000)
  }, [saveChat])

  // Watch for message changes
  useEffect(() => {
    const unsubscribe = threadRuntime.subscribe(() => {
      const state = threadRuntime.getState()
      const messageCount = state.messages.length

      // Only save when message count increases and not running
      if (messageCount > lastMessageCountRef.current && !state.isRunning) {
        lastMessageCountRef.current = messageCount
        debouncedSave()
      }
    })

    return () => {
      unsubscribe()
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [threadRuntime, debouncedSave])

  // Load a chat
  const loadChat = useCallback(async (chatId: string) => {
    if (!window.api) return

    // Don't reload same chat
    if (chatId === currentChatId) return

    // Save current chat first if it has messages
    const currentMessages = convertMessages()
    if (currentMessages.length > 0 && currentChatId) {
      await saveChat()
    }

    const chat = await window.api.getChat(chatId)
    if (!chat) return

    // Convert our messages back to ThreadMessageLike format
    const threadMessages = chat.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: [{ type: 'text' as const, text: m.content }]
    }))

    // Update state first
    setCurrentChatId(chatId)
    lastMessageCountRef.current = chat.messages.length

    // Reset with the loaded messages
    // Note: AI SDK transport may not fully support this - messages display but can't continue
    try {
      threadRuntime.reset(threadMessages)
    } catch (e) {
      console.error('Failed to reset thread:', e)
      threadRuntime.reset()
    }
  }, [currentChatId, threadRuntime, saveChat])

  // Start a new chat
  const newChat = useCallback(async () => {
    // Save current chat first if it has messages
    const currentMessages = convertMessages()
    if (currentMessages.length > 0 && currentChatId) {
      await saveChat()
    }

    // Reset the thread
    threadRuntime.reset()

    setCurrentChatId(null)
    lastMessageCountRef.current = 0
  }, [currentChatId, threadRuntime, saveChat])

  // Delete a chat
  const deleteChat = useCallback(async (chatId: string) => {
    if (!window.api) return

    await window.api.deleteChat(chatId)

    // If we deleted the current chat, start a new one
    if (chatId === currentChatId) {
      threadRuntime.reset()
      setCurrentChatId(null)
      lastMessageCountRef.current = 0
    }
  }, [currentChatId, threadRuntime])

  return {
    currentChatId,
    loadChat,
    newChat,
    deleteChat,
    saveChat
  }
}
