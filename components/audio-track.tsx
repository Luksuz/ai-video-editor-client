"use client"

import { useRef, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, Flag, X } from "lucide-react"

type AudioTrackProps = {
  audio: {
    id: string
    file: File
    fileName: string
    storageKey: string
    storageUrl: string
    duration: number
    url: string
    breakpoints: number[]
    uploading: boolean
    uploaded: boolean
    chunks: any[]
  }
  onAddBreakpoint: (time: number) => void
  onRemoveBreakpoint: (time: number) => void
  totalDuration: number
  disabled?: boolean
  onTimeUpdate?: (time: number) => void
}

export default function AudioTrack({
  audio,
  onAddBreakpoint,
  onRemoveBreakpoint,
  totalDuration,
  disabled = false,
  onTimeUpdate,
}: AudioTrackProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)

  useEffect(() => {
    // Use Supabase storage URL if available, otherwise use local URL
    const audioUrl = audio.storageUrl || audio.url
    const audioElement = new Audio(audioUrl)
    audioRef.current = audioElement

    audioElement.addEventListener("timeupdate", updateTime)
    audioElement.addEventListener("ended", handleEnded)

    return () => {
      audioElement.removeEventListener("timeupdate", updateTime)
      audioElement.removeEventListener("ended", handleEnded)
      audioElement.pause()
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [audio.url, audio.storageUrl])

  useEffect(() => {
    if (canvasRef.current) {
      drawWaveform()
    }
  }, [canvasRef, audio, currentTime])

  // Stop playback if disabled
  useEffect(() => {
    if (disabled && isPlaying && audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }, [disabled, isPlaying])

  const updateTime = () => {
    if (audioRef.current) {
      const newTime = audioRef.current.currentTime;
      setCurrentTime(newTime);
      
      // Call the onTimeUpdate callback if provided
      if (onTimeUpdate) {
        onTimeUpdate(newTime);
      }
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }

  const togglePlayPause = () => {
    if (!audioRef.current || disabled) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }

    setIsPlaying(!isPlaying)
  }

  const handleSliderChange = (value: number[]) => {
    if (!audioRef.current || disabled) return

    const newTime = value[0]
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  const addBreakpoint = () => {
    if (audioRef.current && !disabled) {
      onAddBreakpoint(audioRef.current.currentTime)
    }
  }

  const addEvenBreakpoints = (count: number) => {
    if (!audioRef.current || disabled || count <= 0) return

    const duration = audio.duration
    const interval = duration / (count + 1)

    // Clear existing breakpoints first
    audio.breakpoints.forEach((time) => {
      onRemoveBreakpoint(time)
    })

    // Add new evenly distributed breakpoints
    for (let i = 1; i <= count; i++) {
      const time = interval * i
      onAddBreakpoint(time)
    }
  }

  const drawWaveform = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Set dimensions
    const width = canvas.width
    const height = canvas.height

    // Draw background
    ctx.fillStyle = disabled ? "#f1f1f1" : "#f3f4f6"
    ctx.fillRect(0, 0, width, height)

    // Draw waveform (simplified representation)
    ctx.fillStyle = disabled ? "#c1c1c1" : "#6366f1"

    // Generate a simple waveform pattern
    const barCount = 100
    const barWidth = width / barCount

    for (let i = 0; i < barCount; i++) {
      // Generate a pseudo-random height based on position
      const seed = Math.sin(i * 0.1) * Math.cos(i * 0.3) * Math.sin(i * 0.5)
      const barHeight = ((seed + 1) / 2) * (height * 0.8)

      ctx.fillRect(i * barWidth, height / 2 - barHeight / 2, barWidth - 1, barHeight)
    }

    // Draw playhead
    const playheadPosition = (currentTime / audio.duration) * width
    ctx.fillStyle = "#ef4444"
    ctx.fillRect(playheadPosition, 0, 2, height)

    // Draw breakpoints
    audio.breakpoints.forEach((breakpoint) => {
      const breakpointPosition = (breakpoint / audio.duration) * width

      // Draw breakpoint line
      ctx.fillStyle = "#10b981"
      ctx.fillRect(breakpointPosition - 1, 0, 2, height)

      // Draw breakpoint marker
      ctx.beginPath()
      ctx.arc(breakpointPosition, 10, 5, 0, 2 * Math.PI)
      ctx.fillStyle = "#10b981"
      ctx.fill()
    })

    // Draw chunk boundaries if processed
    if (audio.chunks && audio.chunks.length > 0) {
      audio.chunks.forEach((chunk, index) => {
        const startPosition = (chunk.startTime / audio.duration) * width
        const endPosition = (chunk.endTime / audio.duration) * width

        // Draw semi-transparent overlay for the chunk
        ctx.fillStyle = `rgba(${(index * 40) % 255}, ${(index * 70) % 255}, ${(index * 100) % 255}, 0.2)`
        ctx.fillRect(startPosition, 0, endPosition - startPosition, height)

        // Draw chunk number
        ctx.fillStyle = "#000"
        ctx.font = "10px Arial"
        ctx.fillText(`#${index + 1}`, startPosition + 5, height - 5)
      })
    }
  }

  return (
    <div className="space-y-2 w-full">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={togglePlayPause} disabled={disabled}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </Button>

        <Slider
          value={[currentTime]}
          max={audio.duration}
          step={0.01}
          onValueChange={handleSliderChange}
          className="flex-1"
          disabled={disabled}
        />

        <span className="text-sm text-muted-foreground min-w-[60px] text-right">
          {formatTime(currentTime)} / {formatTime(audio.duration)}
        </span>
      </div>

      <div className="relative">
        <canvas ref={canvasRef} width={800} height={80} className="w-full h-20 rounded border" />
      </div>

      {audio.breakpoints.length > 0 && (
        <div className="mt-2">
          <h4 className="text-sm font-medium mb-1">Breakpoints:</h4>
          <div className="flex flex-wrap gap-2">
            {audio.breakpoints.map((time) => (
              <div
                key={time}
                className="flex items-center gap-1 bg-secondary text-secondary-foreground rounded-full px-2 py-1 text-xs"
              >
                <span>{formatTime(time)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveBreakpoint(time)}
                  className="h-4 w-4 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                  disabled={disabled}
                >
                  <X size={10} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

