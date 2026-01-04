import { Button } from '@/components/ui/button'
import { TooltipIconButton } from './tooltip-icon-button'
import { cn } from '@/lib/utils'
import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive
} from '@assistant-ui/react'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, RefreshCwIcon, SquareIcon, BrainIcon, ChevronDownIcon, SearchIcon, ClockIcon, AppWindowIcon, BarChart3Icon, ListIcon } from 'lucide-react'
import { FC, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto scroll-smooth px-4 pt-4">
        <ThreadPrimitive.Empty>
          <ThreadWelcome />
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage
          }}
        />

        <div className="sticky bottom-0 mt-auto flex w-full max-w-3xl mx-auto flex-col gap-4 bg-background pb-4">
          <ThreadScrollToBottom />
          <Composer />
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-full disabled:invisible"
      >
        <ArrowDownIcon className="w-4 h-4" />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  )
}

const ThreadWelcome: FC = () => {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full bg-primary/10 p-4">
        <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Localbird</h1>
        <p className="text-muted-foreground mt-1">Ask me about your screen history</p>
      </div>
      <div className="grid gap-2 mt-4">
        <ThreadPrimitive.Suggestion prompt="What was I working on earlier today?" autoSend asChild>
          <Button variant="outline" className="text-left justify-start">
            What was I working on earlier today?
          </Button>
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion prompt="Find when I was reading emails" autoSend asChild>
          <Button variant="outline" className="text-left justify-start">
            Find when I was reading emails
          </Button>
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion prompt="What apps have I used most?" autoSend asChild>
          <Button variant="outline" className="text-left justify-start">
            What apps have I used most?
          </Button>
        </ThreadPrimitive.Suggestion>
      </div>
    </div>
  )
}

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="relative flex w-full max-w-3xl mx-auto items-end rounded-2xl border bg-background px-4 py-2 shadow-sm">
      <ComposerPrimitive.Input
        placeholder="Ask about your screen history..."
        className="flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
        rows={1}
        autoFocus
        submitOnEnter
        data-composer-input
      />
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <Button size="icon" className="ml-2 rounded-full h-8 w-8">
            <ArrowUpIcon className="w-4 h-4" />
          </Button>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <Button size="icon" variant="outline" className="ml-2 rounded-full h-8 w-8">
            <SquareIcon className="w-3 h-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </ComposerPrimitive.Root>
  )
}

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="flex w-full max-w-3xl mx-auto py-4">
      <div className="ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

// Tool icon mapping
const toolIcons: Record<string, FC<{ className?: string }>> = {
  semantic_search: SearchIcon,
  time_range_search: ClockIcon,
  app_search: AppWindowIcon,
  get_stats: BarChart3Icon,
  get_recent: ListIcon,
}

// Component to render tool usage badges
const ToolBadge: FC<{ toolName: string }> = ({ toolName }) => {
  const Icon = toolIcons[toolName] || SearchIcon
  const displayName = toolName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 mr-2 mb-2">
      <Icon className="w-3 h-3" />
      {displayName}
      <span className="inline-block w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
    </span>
  )
}

// Component to render thinking blocks
const ThinkingBlock: FC<{ content: string }> = ({ content }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const previewLength = 100
  const preview = content.length > previewLength
    ? content.slice(0, previewLength).trim() + '...'
    : content

  return (
    <div className="mb-4 rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-500/5 to-transparent overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-purple-500/5 transition-colors"
      >
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/20">
          <BrainIcon className="w-3.5 h-3.5 text-purple-400" />
        </div>
        <span className="font-medium text-purple-300">Thinking</span>
        {!isExpanded && (
          <span className="text-xs text-muted-foreground truncate flex-1 text-left ml-2">
            {preview}
          </span>
        )}
        <ChevronDownIcon className={cn(
          "w-4 h-4 text-purple-400 transition-transform duration-200",
          isExpanded && "rotate-180"
        )} />
      </button>
      <div className={cn(
        "overflow-hidden transition-all duration-200",
        isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="px-4 pb-4 text-sm text-muted-foreground whitespace-pre-wrap border-t border-purple-500/10 pt-3 max-h-[400px] overflow-y-auto">
          {content}
        </div>
      </div>
    </div>
  )
}

// Parse text to separate thinking blocks, tool usage, and regular content
type ContentPart =
  | { type: 'thinking'; content: string }
  | { type: 'tool'; content: string }
  | { type: 'text'; content: string }

const parseContent = (text: string): ContentPart[] => {
  const parts: ContentPart[] = []

  // Handle both complete and incomplete thinking blocks
  // Check for unclosed thinking tag first
  const openTagIndex = text.indexOf('<thinking>')
  const closeTagIndex = text.indexOf('</thinking>')

  if (openTagIndex !== -1) {
    // Add text before thinking
    if (openTagIndex > 0) {
      const before = text.slice(0, openTagIndex)
      if (before.trim()) {
        parts.push(...parseToolsAndText(before))
      }
    }

    if (closeTagIndex !== -1 && closeTagIndex > openTagIndex) {
      // Complete thinking block
      const thinkingContent = text.slice(openTagIndex + 10, closeTagIndex)
      parts.push({ type: 'thinking', content: thinkingContent })

      // Parse remaining text after </thinking>
      const after = text.slice(closeTagIndex + 11)
      if (after.trim()) {
        parts.push(...parseToolsAndText(after))
      }
    } else {
      // Unclosed thinking block - everything after <thinking> is thinking content
      const thinkingContent = text.slice(openTagIndex + 10)
      parts.push({ type: 'thinking', content: thinkingContent })
    }
  } else {
    // No thinking tags, just parse tools and text
    parts.push(...parseToolsAndText(text))
  }

  return parts
}

// Helper to parse tool usage and regular text
const parseToolsAndText = (text: string): ContentPart[] => {
  const parts: ContentPart[] = []
  const toolRegex = /\[Using (\w+)\.{3}\]/g
  let lastIndex = 0
  let match

  while ((match = toolRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index)
      if (textContent.trim()) {
        parts.push({ type: 'text', content: textContent })
      }
    }
    parts.push({ type: 'tool', content: match[1] })
    lastIndex = toolRegex.lastIndex
  }

  if (lastIndex < text.length) {
    const textContent = text.slice(lastIndex)
    if (textContent.trim()) {
      parts.push({ type: 'text', content: textContent })
    }
  }

  return parts
}

// Custom text renderer that handles thinking blocks and tool badges
const TextWithThinking: FC<{ text: string }> = ({ text }) => {
  const parts = parseContent(text)

  // Group consecutive tool badges together
  const groupedParts: Array<ContentPart | { type: 'tools'; tools: string[] }> = []
  let currentTools: string[] = []

  for (const part of parts) {
    if (part.type === 'tool') {
      currentTools.push(part.content)
    } else {
      if (currentTools.length > 0) {
        groupedParts.push({ type: 'tools', tools: currentTools })
        currentTools = []
      }
      groupedParts.push(part)
    }
  }
  if (currentTools.length > 0) {
    groupedParts.push({ type: 'tools', tools: currentTools })
  }

  return (
    <>
      {groupedParts.map((part, i) => {
        if (part.type === 'thinking') {
          return <ThinkingBlock key={i} content={part.content} />
        } else if (part.type === 'tools') {
          return (
            <div key={i} className="flex flex-wrap mb-2">
              {part.tools.map((tool, j) => (
                <ToolBadge key={j} toolName={tool} />
              ))}
            </div>
          )
        } else {
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm, remarkBreaks]}>
              {part.content}
            </ReactMarkdown>
          )
        }
      })}
    </>
  )
}

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="flex w-full max-w-3xl mx-auto py-4">
      <div className="flex-1">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MessagePrimitive.Content
            components={{
              Text: ({ text }) => <TextWithThinking text={text} />
            }}
          />
        </div>
        <div className="mt-2 flex items-center gap-1">
          <BranchPicker />
          <AssistantActionBar />
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex gap-1 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy" size="sm">
          <MessagePrimitive.If copied>
            <CheckIcon className="w-4 h-4" />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon className="w-4 h-4" />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Regenerate" size="sm">
          <RefreshCwIcon className="w-4 h-4" />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  )
}

const BranchPicker: FC = () => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className="inline-flex items-center text-xs text-muted-foreground"
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous" size="sm">
          <ChevronLeftIcon className="w-4 h-4" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="mx-1">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next" size="sm">
          <ChevronRightIcon className="w-4 h-4" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  )
}
