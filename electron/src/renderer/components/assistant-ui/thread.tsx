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
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, RefreshCwIcon, SquareIcon } from 'lucide-react'
import type { FC } from 'react'
import ReactMarkdown from 'react-markdown'

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
        <ThreadPrimitive.Suggestion prompt="What was I working on earlier today?" asChild>
          <Button variant="outline" className="text-left justify-start">
            What was I working on earlier today?
          </Button>
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion prompt="Find when I was reading emails" asChild>
          <Button variant="outline" className="text-left justify-start">
            Find when I was reading emails
          </Button>
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion prompt="What apps have I used most?" asChild>
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

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="flex w-full max-w-3xl mx-auto py-4">
      <div className="flex-1">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MessagePrimitive.Content
            components={{
              Text: ({ text }) => <ReactMarkdown>{text}</ReactMarkdown>
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
