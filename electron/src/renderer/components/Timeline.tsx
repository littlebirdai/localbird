import { useState, useEffect, useRef, useCallback } from 'react'
import { Image as ImageIcon, Grid3X3, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Frame {
  id: string
  score: number
  timestamp: number
  summary: string
  activeApplication: string | null
  userActivity: string | null
}

interface TimelineData {
  frames: Frame[]
  start: number
  end: number
}

type ViewMode = 'grid' | 'timeline'

export function Timeline() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null)

  const loadTimeline = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('http://localhost:3001/api/frames/timeline?hours=24')
      const data = await response.json()
      setTimelineData(data)
    } catch (error) {
      console.error('Failed to load timeline:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTimeline()
  }, [loadTimeline])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (!timelineData?.frames.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground gap-3">
        <ImageIcon className="w-16 h-16 opacity-50" />
        <p className="text-lg">No captures yet</p>
        <p className="text-sm opacity-70">Start capturing to see your screen history here</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between px-6 py-4 border-b app-drag-region">
        <h1 className="text-lg font-semibold">Screen History</h1>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              viewMode === 'grid'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Grid3X3 className="w-4 h-4" />
            Grid
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              viewMode === 'timeline'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Clock className="w-4 h-4" />
            Timeline
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'grid' ? (
        <GridView
          frames={timelineData.frames}
          onSelectFrame={setSelectedFrame}
        />
      ) : (
        <TimelineScrubber timelineData={timelineData} />
      )}

      {/* Modal for selected frame */}
      {selectedFrame && (
        <FrameModal frame={selectedFrame} onClose={() => setSelectedFrame(null)} />
      )}
    </div>
  )
}

// Grid view component
function GridView({
  frames,
  onSelectFrame
}: {
  frames: Frame[]
  onSelectFrame: (frame: Frame) => void
}) {
  // Group frames by hour
  const groupedFrames = frames.reduce((acc, frame) => {
    const date = new Date(frame.timestamp * 1000)
    const hourKey = date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric'
    })
    if (!acc[hourKey]) acc[hourKey] = []
    acc[hourKey].push(frame)
    return acc
  }, {} as Record<string, Frame[]>)

  // Reverse to show most recent first
  const sortedGroups = Object.entries(groupedFrames).reverse()

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-8">
        {sortedGroups.map(([hour, hourFrames]) => (
          <div key={hour}>
            <h2 className="text-sm font-medium text-muted-foreground mb-3 sticky top-0 bg-background py-2">
              {hour}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {hourFrames.slice().reverse().map((frame) => (
                <FrameCard
                  key={frame.id}
                  frame={frame}
                  onClick={() => onSelectFrame(frame)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Frame card component
function FrameCard({ frame, onClick }: { frame: Frame; onClick: () => void }) {
  const time = new Date(frame.timestamp * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })

  return (
    <button
      onClick={onClick}
      className="group relative aspect-video rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all"
    >
      <img
        src={`http://localhost:3001/api/frames/${frame.id}/image`}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="flex items-center justify-between text-white text-xs">
          <span className="truncate">{frame.activeApplication || 'Unknown'}</span>
          <span className="opacity-70">{time}</span>
        </div>
      </div>
    </button>
  )
}

// Frame modal component
function FrameModal({ frame, onClose }: { frame: Frame; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const time = new Date(frame.timestamp * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  })

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white p-2 rounded-full hover:bg-white/10"
      >
        <X className="w-6 h-6" />
      </button>

      <div
        className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={`http://localhost:3001/api/frames/${frame.id}/image`}
          alt=""
          className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
        />
        <div className="flex items-center gap-4 text-white text-sm">
          {frame.activeApplication && (
            <span className="font-semibold">{frame.activeApplication}</span>
          )}
          <span className="text-white/60">{time}</span>
          {frame.summary && (
            <>
              <span className="text-white/30">|</span>
              <span className="text-white/60 max-w-lg">{frame.summary}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Timeline scrubber component (Rewind-style)
function TimelineScrubber({ timelineData }: { timelineData: TimelineData }) {
  const [currentIndex, setCurrentIndex] = useState(timelineData.frames.length - 1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartIndex, setDragStartIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!timelineData?.frames.length) return

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        setCurrentIndex(i => Math.max(0, i - step))
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        setCurrentIndex(i => Math.min(timelineData.frames.length - 1, i + step))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setCurrentIndex(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setCurrentIndex(timelineData.frames.length - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [timelineData])

  // Global mouse drag for scrubbing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!timelineData?.frames.length) return
    setIsDragging(true)
    setDragStartX(e.clientX)
    setDragStartIndex(currentIndex)
    e.preventDefault()
  }, [timelineData, currentIndex])

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(false)
      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!timelineData?.frames.length || !containerRef.current) return
        const containerWidth = containerRef.current.offsetWidth
        const deltaX = e.clientX - dragStartX
        const sensitivity = timelineData.frames.length / (containerWidth * 0.5)
        const indexDelta = Math.round(deltaX * sensitivity)
        const newIndex = Math.max(0, Math.min(timelineData.frames.length - 1, dragStartIndex + indexDelta))
        setCurrentIndex(newIndex)
      }
      window.addEventListener('mouseup', handleGlobalMouseUp)
      window.addEventListener('mousemove', handleGlobalMouseMove)
      return () => {
        window.removeEventListener('mouseup', handleGlobalMouseUp)
        window.removeEventListener('mousemove', handleGlobalMouseMove)
      }
    }
  }, [isDragging, timelineData, dragStartX, dragStartIndex])

  const currentFrame = timelineData?.frames[currentIndex]
  const progress = timelineData?.frames.length && timelineData.frames.length > 1
    ? currentIndex / (timelineData.frames.length - 1)
    : 0

  // Generate time markers
  const getTimeMarkers = () => {
    if (!timelineData) return []
    const markers: { position: number; label: string }[] = []
    const startTime = timelineData.start * 1000
    const endTime = timelineData.end * 1000
    const duration = endTime - startTime
    const hoursSpan = duration / (1000 * 60 * 60)

    const markerInterval = hoursSpan > 12 ? 4 : hoursSpan > 6 ? 2 : 1

    const startHour = new Date(startTime)
    startHour.setMinutes(0, 0, 0)
    let markerTime = startHour.getTime()
    if (markerTime < startTime) markerTime += 60 * 60 * 1000

    while (markerTime < endTime) {
      const position = (markerTime - startTime) / duration
      const date = new Date(markerTime)
      const hour = date.getHours()

      if (hour % markerInterval === 0) {
        markers.push({
          position,
          label: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        })
      }
      markerTime += 60 * 60 * 1000
    }
    return markers
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col bg-black select-none"
      onMouseDown={handleMouseDown}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* Main preview area */}
      <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden">
        {currentFrame && (
          <>
            <img
              src={`http://localhost:3001/api/frames/${currentFrame.id}/image`}
              alt=""
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl pointer-events-none"
              draggable={false}
            />

            {/* Metadata overlay */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/80 backdrop-blur-md rounded-2xl px-5 py-3 text-white shadow-xl">
              {currentFrame.activeApplication && (
                <span className="font-semibold text-sm">{currentFrame.activeApplication}</span>
              )}
              <span className="text-sm text-white/60">
                {new Date(currentFrame.timestamp * 1000).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </span>
              {currentFrame.summary && (
                <>
                  <span className="text-white/30">|</span>
                  <span className="text-sm text-white/60 max-w-sm truncate">
                    {currentFrame.summary}
                  </span>
                </>
              )}
            </div>

            {/* Drag hint */}
            {!isDragging && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/40 text-xs bg-black/40 px-3 py-1.5 rounded-full">
                Drag anywhere to scrub through time
              </div>
            )}
          </>
        )}
      </div>

      {/* Timeline scrubber */}
      <div className="bg-zinc-950 border-t border-zinc-800/50 px-6 py-5">
        {/* Time markers */}
        <div className="relative h-5 mb-3">
          {getTimeMarkers().map((marker, i) => (
            <span
              key={i}
              className="absolute text-[11px] text-zinc-500 -translate-x-1/2 font-medium"
              style={{ left: `${marker.position * 100}%` }}
            >
              {marker.label}
            </span>
          ))}
        </div>

        {/* Scrubber track */}
        <div className="relative h-14 bg-zinc-900 rounded-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-800/50 via-zinc-800/30 to-zinc-800/50" />

          {/* Frame density visualization */}
          <div className="absolute inset-0">
            {timelineData.frames.map((frame, i) => {
              const position = timelineData.frames.length > 1
                ? i / (timelineData.frames.length - 1) * 100
                : 50
              const isNearCurrent = Math.abs(i - currentIndex) < 5
              return (
                <div
                  key={frame.id}
                  className="absolute bottom-0 w-px transition-all duration-75"
                  style={{
                    left: `${position}%`,
                    height: isNearCurrent ? '60%' : '25%',
                    backgroundColor: isNearCurrent ? 'rgb(59, 130, 246)' : 'rgb(63, 63, 70)',
                    opacity: isNearCurrent ? 1 : 0.6
                  }}
                />
              )
            })}
          </div>

          {/* Progress fill */}
          <div
            className="absolute inset-y-0 left-0 bg-blue-500/10"
            style={{ width: `${progress * 100}%` }}
          />

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-500 shadow-lg shadow-blue-500/50 transition-all duration-75"
            style={{ left: `${progress * 100}%`, transform: 'translateX(-50%)' }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-500 rounded-full shadow-lg shadow-blue-500/50 border-2 border-white" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-500 rounded-full shadow-lg shadow-blue-500/50 border-2 border-white" />
          </div>
        </div>

        {/* Status bar */}
        <div className="flex justify-between items-center mt-4 text-xs text-zinc-500">
          <span className="font-medium">{timelineData.frames.length} captures</span>
          <span className="text-zinc-400">
            {currentIndex + 1} of {timelineData.frames.length}
            <span className="text-zinc-600 ml-2">| Arrow keys or drag to navigate</span>
          </span>
          <span>
            {new Date(timelineData.start * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            {' - '}
            {new Date(timelineData.end * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
    </div>
  )
}
