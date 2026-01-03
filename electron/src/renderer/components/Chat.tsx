import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { Thread } from './assistant-ui/thread'

export function Chat() {
  const runtime = useChatRuntime({
    api: 'http://localhost:3001/api/chat'
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-full">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  )
}
