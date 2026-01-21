import { useState, useEffect, useCallback } from 'react'
import { Mic, MicOff, Square, Trash2, Clock, FileText, ChevronRight, Plus, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Clean transcript of blank audio markers
function cleanTranscriptText(text: string): string {
  return text
    .replace(/\[BLANK_AUDIO\]/gi, '')
    .replace(/\[ Silence \]/gi, '')
    .replace(/\[Silence\]/gi, '')
    .replace(/\(silence\)/gi, '')
    .replace(/\(baby babbling\)/gi, '')
    .replace(/\(upbeat music\)/gi, '')
    .replace(/\(music\)/gi, '')
    .replace(/\(keyboard clacking\)/gi, '')
    .replace(/\[typing\]/gi, '')
    .replace(/<\|startoftranscript\|>/gi, '')
    .replace(/<\|endoftext\|>/gi, '')
    .replace(/<\|transcribe\|>/gi, '')
    .replace(/<\|en\|>/gi, '')
    .replace(/<\|\d+\.\d+\|>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface TranscriptSegment {
  startTime: number
  endTime: number
  text: string
}

interface MeetingNote {
  id: string
  title: string
  startTime: number
  endTime: number | null
  duration: number
  transcript: string
  segments: TranscriptSegment[]
  summary: string | null
  audioPath: string | null
}

interface MeetingListItem {
  id: string
  title: string
  startTime: number
  endTime: number | null
  duration: number
  transcriptPreview: string
}

interface MeetingStatus {
  state: 'idle' | 'recording' | 'processing' | 'error'
  currentMeetingId: string | null
  duration: number
  liveTranscript: string
  error: string | null
}

export function MeetingNotes() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingNote | null>(null)
  const [recordingStatus, setRecordingStatus] = useState<MeetingStatus>({
    state: 'idle',
    currentMeetingId: null,
    duration: 0,
    liveTranscript: '',
    error: null
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isRecorderOpen, setIsRecorderOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load meetings
  const loadMeetings = useCallback(async () => {
    if (!window.api) return
    try {
      const list = await window.api.listMeetings()
      setMeetings(list)
    } catch (err) {
      console.error('Failed to load meetings:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMeetings()
  }, [loadMeetings])

  // Check for existing recording on mount
  useEffect(() => {
    if (!window.api) return

    const checkRecordingStatus = async () => {
      try {
        const status = await window.api.getMeetingStatus()
        if (status.state === 'recording' || status.state === 'processing') {
          setRecordingStatus(status)
          setIsRecorderOpen(true)
        }
      } catch (err) {
        console.error('Failed to check recording status:', err)
      }
    }

    checkRecordingStatus()
  }, [])

  // Poll recording status when recording
  useEffect(() => {
    if (!window.api || recordingStatus.state !== 'recording') return

    const interval = setInterval(async () => {
      const status = await window.api.getMeetingStatus()
      setRecordingStatus(status)
    }, 500)

    return () => clearInterval(interval)
  }, [recordingStatus.state])

  // Start recording
  const handleStartRecording = async (title?: string) => {
    if (!window.api) return
    setError(null)

    try {
      const result = await window.api.startMeeting(title || 'Meeting')
      if (result.success) {
        setRecordingStatus({
          state: 'recording',
          currentMeetingId: result.meetingId || null,
          duration: 0,
          liveTranscript: '',
          error: null
        })
        setIsRecorderOpen(true)
      } else {
        setError(result.error || 'Failed to start recording')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording')
    }
  }

  // Stop recording
  const handleStopRecording = async () => {
    if (!window.api) return
    setError(null)

    setRecordingStatus(prev => ({ ...prev, state: 'processing' }))

    try {
      const result = await window.api.stopMeeting()
      if (result.success) {
        setRecordingStatus({
          state: 'idle',
          currentMeetingId: null,
          duration: 0,
          liveTranscript: '',
          error: null
        })
        setIsRecorderOpen(false)
        loadMeetings()
      } else {
        setError(result.error || 'Failed to stop recording')
        setRecordingStatus(prev => ({ ...prev, state: 'error', error: result.error || null }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop recording')
      setRecordingStatus(prev => ({ ...prev, state: 'error' }))
    }
  }

  // Cancel recording
  const handleCancelRecording = async () => {
    if (!window.api) return

    try {
      await window.api.cancelMeeting()
      setRecordingStatus({
        state: 'idle',
        currentMeetingId: null,
        duration: 0,
        liveTranscript: '',
        error: null
      })
      setIsRecorderOpen(false)
    } catch (err) {
      console.error('Failed to cancel recording:', err)
    }
  }

  // Select meeting to view
  const handleSelectMeeting = async (id: string) => {
    if (!window.api) return

    try {
      const meeting = await window.api.getMeeting(id)
      setSelectedMeeting(meeting)
    } catch (err) {
      console.error('Failed to load meeting:', err)
    }
  }

  // Delete meeting
  const handleDeleteMeeting = async (id: string) => {
    if (!window.api) return

    try {
      await window.api.deleteMeeting(id)
      if (selectedMeeting?.id === id) {
        setSelectedMeeting(null)
      }
      loadMeetings()
    } catch (err) {
      console.error('Failed to delete meeting:', err)
    }
  }

  // Format duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const isYesterday = date.toDateString() === new Date(now.getTime() - 86400000).toDateString()

    if (isToday) return 'Today'
    if (isYesterday) return 'Yesterday'
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  // Group meetings by date
  const groupedMeetings = meetings.reduce((acc, meeting) => {
    const dateKey = formatDate(meeting.startTime)
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(meeting)
    return acc
  }, {} as Record<string, MeetingListItem[]>)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex h-full bg-background">
      {/* Meetings list */}
      <div className="w-80 border-r flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b app-drag-region">
          <h1 className="text-lg font-semibold">Meeting Notes</h1>
          <button
            onClick={() => setIsRecorderOpen(true)}
            disabled={recordingStatus.state === 'recording'}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              recordingStatus.state === 'recording'
                ? 'bg-red-500 text-white'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {recordingStatus.state === 'recording' ? (
              <>
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                Recording
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                New
              </>
            )}
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-4 mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Meetings list */}
        <div className="flex-1 overflow-y-auto">
          {Object.keys(groupedMeetings).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-4 text-center">
              <Mic className="w-12 h-12 opacity-50 mb-3" />
              <p className="text-sm">No meetings yet</p>
              <p className="text-xs opacity-70 mt-1">Click "New" to start recording</p>
            </div>
          ) : (
            <div className="py-2">
              {Object.entries(groupedMeetings).map(([date, dateMeetings]) => (
                <div key={date}>
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground sticky top-0 bg-background">
                    {date}
                  </div>
                  {dateMeetings.map((meeting) => (
                    <MeetingListCard
                      key={meeting.id}
                      meeting={meeting}
                      isSelected={selectedMeeting?.id === meeting.id}
                      onClick={() => handleSelectMeeting(meeting.id)}
                      onDelete={() => handleDeleteMeeting(meeting.id)}
                      formatDuration={formatDuration}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Meeting detail / Recorder */}
      <div className="flex-1 flex flex-col">
        {isRecorderOpen || recordingStatus.state === 'recording' || recordingStatus.state === 'processing' ? (
          <RecordingView
            status={recordingStatus}
            onStart={handleStartRecording}
            onStop={handleStopRecording}
            onCancel={handleCancelRecording}
            formatDuration={formatDuration}
            cleanTranscript={cleanTranscriptText}
          />
        ) : selectedMeeting ? (
          <MeetingDetail
            meeting={selectedMeeting}
            onClose={() => setSelectedMeeting(null)}
            formatDuration={formatDuration}
          />
        ) : (
          <EmptyState onStartRecording={() => setIsRecorderOpen(true)} />
        )}
      </div>
    </div>
  )
}

// Meeting list card component
function MeetingListCard({
  meeting,
  isSelected,
  onClick,
  onDelete,
  formatDuration
}: {
  meeting: MeetingListItem
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
  formatDuration: (seconds: number) => string
}) {
  const time = new Date(meeting.startTime * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left group',
        isSelected && 'bg-muted'
      )}
    >
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Mic className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate">{meeting.title}</span>
          <span className="text-xs text-muted-foreground shrink-0">{time}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(meeting.duration)}
          </span>
        </div>
        {meeting.transcriptPreview && cleanTranscriptText(meeting.transcriptPreview) && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cleanTranscriptText(meeting.transcriptPreview)}</p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded text-destructive transition-opacity"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </button>
  )
}

// Recording view component
function RecordingView({
  status,
  onStart,
  onStop,
  onCancel,
  formatDuration,
  cleanTranscript
}: {
  status: MeetingStatus
  onStart: (title?: string) => void
  onStop: () => void
  onCancel: () => void
  formatDuration: (seconds: number) => string
  cleanTranscript: (text: string) => string
}) {
  const [title, setTitle] = useState('')

  if (status.state === 'idle') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Mic className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Start a New Recording</h2>
        <p className="text-muted-foreground text-sm mb-6 text-center max-w-md">
          Record your meetings and get automatic transcriptions with timestamps.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <input
            type="text"
            placeholder="Meeting title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="px-4 py-2 rounded-lg border bg-background text-sm"
          />
          <button
            onClick={() => onStart(title || undefined)}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
          >
            <Mic className="w-5 h-5" />
            Start Recording
          </button>
          <button
            onClick={onCancel}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (status.state === 'processing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6 animate-pulse">
          <FileText className="w-12 h-12 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Processing...</h2>
        <p className="text-muted-foreground text-sm text-center max-w-md">
          Finalizing transcription. This may take a moment.
        </p>
      </div>
    )
  }

  // Recording state
  return (
    <div className="flex-1 flex flex-col">
      {/* Recording header */}
      <div className="flex items-center justify-center gap-4 py-6 border-b bg-red-500/5">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <span className="text-2xl font-mono font-semibold">{formatDuration(status.duration)}</span>
      </div>

      {/* Live transcript */}
      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Live Transcript</h3>
        {status.liveTranscript && cleanTranscript(status.liveTranscript) ? (
          <p className="text-sm leading-relaxed">{cleanTranscript(status.liveTranscript)}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Listening... Start speaking to see the transcription.
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 p-6 border-t">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5" />
          Cancel
        </button>
        <button
          onClick={onStop}
          className="flex items-center gap-2 px-6 py-3 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
        >
          <Square className="w-5 h-5" />
          Stop Recording
        </button>
      </div>
    </div>
  )
}

// Meeting detail view
function MeetingDetail({
  meeting,
  onClose,
  formatDuration
}: {
  meeting: MeetingNote
  onClose: () => void
  formatDuration: (seconds: number) => string
}) {
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript'>('summary')
  const startDate = new Date(meeting.startTime * 1000)

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b app-drag-region">
        <div>
          <h2 className="text-lg font-semibold">{meeting.title}</h2>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span>
              {startDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span>
              {startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDuration(meeting.duration)}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-6">
        <button
          onClick={() => setActiveTab('summary')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'summary'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Summary
        </button>
        <button
          onClick={() => setActiveTab('transcript')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'transcript'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Transcript
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'summary' ? (
          <>
            {meeting.summary ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{meeting.summary}</div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No summary available. Summaries are generated when a meeting recording is completed.
              </p>
            )}
          </>
        ) : (
          <>
            {meeting.segments.length > 0 ? (
              <div className="space-y-4">
                {meeting.segments.map((segment, i) => (
                  <div key={i} className="flex gap-4">
                    <span className="text-xs text-muted-foreground font-mono shrink-0 pt-0.5 w-12">
                      {formatDuration(segment.startTime)}
                    </span>
                    <p className="text-sm leading-relaxed">{segment.text}</p>
                  </div>
                ))}
              </div>
            ) : meeting.transcript ? (
              <p className="text-sm leading-relaxed">{meeting.transcript}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No transcript available</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Empty state
function EmptyState({ onStartRecording }: { onStartRecording: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
        <FileText className="w-10 h-10 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Select a meeting</h2>
      <p className="text-muted-foreground text-sm mb-4 max-w-sm">
        Choose a meeting from the list to view its transcript, or start a new recording.
      </p>
      <button
        onClick={onStartRecording}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
      >
        <Mic className="w-4 h-4" />
        Start Recording
      </button>
    </div>
  )
}
