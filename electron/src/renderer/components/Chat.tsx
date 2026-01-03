import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { TextStreamChatTransport } from 'ai'
import { Thread } from './assistant-ui/thread'

const transport = new TextStreamChatTransport({
  api: 'http://localhost:3001/api/chat'
})

export function Chat() {
  const runtime = useChatRuntime({ transport })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-full">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  )
}
