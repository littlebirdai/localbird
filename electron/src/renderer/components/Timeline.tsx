import { useState, useEffect } from 'react'
import { Search, RefreshCw, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Frame {
  id: string
  score: number
  timestamp: number
  summary: string
  activeApplication: string | null
  userActivity: string | null
}

export function Timeline() {
  const [frames, setFrames] = useState<Frame[]>([])
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  const loadFrames = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('http://localhost:3001/api/frames')
      const data = await response.json()
      setFrames(data.frames || [])
    } catch (error) {
      console.error('Failed to load frames:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const searchFrames = async () => {
    if (!searchQuery.trim()) {
      loadFrames()
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch('http://localhost:3001/api/frames/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 50 })
      })
      const data = await response.json()
      setFrames(data.frames || [])
    } catch (error) {
      console.error('Failed to search frames:', error)
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    loadFrames()
  }, [])

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  return (
    <div className="flex h-full">
      {/* Left panel - Grid */}
      <div className="flex-1 flex flex-col border-r">
        {/* Search bar */}
        <div className="p-4 border-b">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search captures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchFrames()}
                className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button variant="outline" size="icon" onClick={searchFrames} disabled={isSearching}>
              <Search className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={loadFrames} disabled={isLoading}>
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading...
            </div>
          ) : frames.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <ImageIcon className="w-12 h-12" />
              <p>No captures yet</p>
              <p className="text-sm">Start capturing to see your screen history here</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {frames.map((frame) => (
                <FrameCard
                  key={frame.id}
                  frame={frame}
                  isSelected={selectedFrame?.id === frame.id}
                  onClick={() => setSelectedFrame(frame)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="px-4 py-2 border-t text-sm text-muted-foreground">
          {frames.length} captures
        </div>
      </div>

      {/* Right panel - Detail */}
      <div className="w-96 flex flex-col">
        {selectedFrame ? (
          <FrameDetail frame={selectedFrame} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Select a capture to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}

function FrameCard({
  frame,
  isSelected,
  onClick
}: {
  frame: Frame
  isSelected: boolean
  onClick: () => void
}) {
  const [imageError, setImageError] = useState(false)

  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg border bg-card overflow-hidden text-left transition-all hover:ring-2 hover:ring-ring',
        isSelected && 'ring-2 ring-primary'
      )}
    >
      <div className="aspect-video bg-muted relative">
        {!imageError ? (
          <img
            src={`http://localhost:3001/api/frames/${frame.id}/image`}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
          </div>
        )}
      </div>
      <div className="p-2">
        {frame.summary && (
          <p className="text-xs line-clamp-2 mb-1">{frame.summary}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {new Date(frame.timestamp * 1000).toLocaleTimeString()}
        </p>
      </div>
    </button>
  )
}

function FrameDetail({ frame }: { frame: Frame }) {
  const [imageError, setImageError] = useState(false)

  return (
    <div className="flex flex-col h-full">
      {/* Image */}
      <div className="aspect-video bg-black flex items-center justify-center">
        {!imageError ? (
          <img
            src={`http://localhost:3001/api/frames/${frame.id}/image`}
            alt=""
            className="max-w-full max-h-full object-contain"
            onError={() => setImageError(true)}
          />
        ) : (
          <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
        )}
      </div>

      {/* Metadata */}
      <div className="flex-1 p-4 overflow-y-auto">
        <h3 className="font-medium mb-2">Details</h3>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Time</dt>
            <dd>{new Date(frame.timestamp * 1000).toLocaleString()}</dd>
          </div>

          {frame.activeApplication && (
            <div>
              <dt className="text-muted-foreground">Application</dt>
              <dd>{frame.activeApplication}</dd>
            </div>
          )}

          {frame.summary && (
            <div>
              <dt className="text-muted-foreground">Summary</dt>
              <dd>{frame.summary}</dd>
            </div>
          )}

          {frame.userActivity && (
            <div>
              <dt className="text-muted-foreground">Activity</dt>
              <dd>{frame.userActivity}</dd>
            </div>
          )}

          {frame.score < 1 && (
            <div>
              <dt className="text-muted-foreground">Relevance</dt>
              <dd>{Math.round(frame.score * 100)}%</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}
