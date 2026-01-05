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
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center px-4">
      <div className="rounded-2xl bg-muted/50 p-5">
        <svg className="w-10 h-10 text-primary/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-medium text-foreground/90">Localbird</h1>
        <p className="text-sm text-muted-foreground/70">Search your screen history with AI</p>
      </div>
      <div className="flex flex-col gap-2 mt-2 w-full max-w-sm">
        <ThreadPrimitive.Suggestion prompt="What was I working on earlier today?" autoSend asChild>
          <Button variant="ghost" className="text-left justify-start text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 h-auto py-2.5 px-3 font-normal">
            What was I working on earlier today?
          </Button>
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion prompt="Find when I was reading emails" autoSend asChild>
          <Button variant="ghost" className="text-left justify-start text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 h-auto py-2.5 px-3 font-normal">
            Find when I was reading emails
          </Button>
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion prompt="What apps have I used most?" autoSend asChild>
          <Button variant="ghost" className="text-left justify-start text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 h-auto py-2.5 px-3 font-normal">
            What apps have I used most?
          </Button>
        </ThreadPrimitive.Suggestion>
      </div>
    </div>
  )
}

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="relative flex w-full max-w-3xl mx-auto items-end rounded-xl border border-border/60 bg-card/80 px-4 py-2.5 shadow-sm backdrop-blur-sm">
      <ComposerPrimitive.Input
        placeholder="Ask about your screen history..."
        className="flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground/50"
        rows={1}
        autoFocus
        submitOnEnter
        data-composer-input
      />
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <Button size="icon" className="ml-2 rounded-full h-7 w-7 bg-primary/90 hover:bg-primary text-primary-foreground">
            <ArrowUpIcon className="w-3.5 h-3.5" />
          </Button>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <Button size="icon" variant="ghost" className="ml-2 rounded-full h-7 w-7 text-muted-foreground hover:text-foreground">
            <SquareIcon className="w-3 h-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </ComposerPrimitive.Root>
  )
}

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="flex w-full max-w-3xl mx-auto py-3">
      <div className="ml-auto max-w-[80%] rounded-2xl bg-primary/90 px-4 py-2.5 text-primary-foreground text-sm">
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

// Component to render tool usage - subtle inline indicator
const ToolBadge: FC<{ toolName: string }> = ({ toolName }) => {
  const Icon = toolIcons[toolName] || SearchIcon
  const displayName = toolName.replace(/_/g, ' ')

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 italic">
      <Icon className="w-3 h-3" />
      <span>{displayName}</span>
    </span>
  )
}

// Component to render thinking blocks - warm, subtle styling
const ThinkingBlock: FC<{ content: string }> = ({ content }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const previewLength = 120
  const preview = content.length > previewLength
    ? content.slice(0, previewLength).trim() + '…'
    : content

  return (
    <div className="mb-4 rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
      >
        <BrainIcon className="w-4 h-4 text-muted-foreground/60" />
        <span className="text-muted-foreground/80 text-xs font-medium">Thinking</span>
        {!isExpanded && (
          <span className="text-xs text-muted-foreground/50 truncate flex-1 text-left">
            {preview}
          </span>
        )}
        <ChevronDownIcon className={cn(
          "w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200",
          isExpanded && "rotate-180"
        )} />
      </button>
      <div className={cn(
        "overflow-hidden transition-all duration-200",
        isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="px-3 pb-3 text-sm text-muted-foreground/70 whitespace-pre-wrap border-t border-border/30 pt-3 max-h-[400px] overflow-y-auto leading-relaxed">
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
            <div key={i} className="flex items-center gap-3 py-2 mb-2 text-muted-foreground/60">
              <span className="text-xs">Searching:</span>
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
    <MessagePrimitive.Root className="flex w-full max-w-3xl mx-auto py-3">
      <div className="flex-1">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-foreground/85 prose-p:leading-relaxed prose-headings:text-foreground/90 prose-strong:text-foreground/90 prose-li:text-foreground/85">
          <MessagePrimitive.Content
            components={{
              Text: ({ text }) => <TextWithThinking text={text} />
            }}
          />
        </div>
        <div className="mt-3 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
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
