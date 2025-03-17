"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, X, Save, Loader2, Upload, FileAudio, GripVertical, Flag, Scissors, Layers } from "lucide-react"
import AudioTrack from "@/components/audio-track"
import { toast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

type AudioFile = {
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
  chunks: AudioChunk[]
  currentTime?: number
}

type AudioChunk = {
  id: string
  startTime: number
  endTime: number
  duration: number
}

export default function VideoEditor() {
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [draggedItem, setDraggedItem] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [debugData, setDebugData] = useState<string | null>(null)

  const router = useRouter()

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const newFiles = Array.from(e.target.files)

    // Create entries with local URLs for immediate display, but don't upload yet
    const tempFiles = await Promise.all(
      newFiles.map(async (file) => {
        const url = URL.createObjectURL(file)
        const duration = await getAudioDuration(url)
        const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        return {
          id,
          file,
          fileName: file.name,
          storageKey: "",
          storageUrl: "",
          duration,
          url, // Local URL for playback
          breakpoints: [],
          uploading: false,
          uploaded: false,
          chunks: [],
        }
      }),
    )

    // Add files to state
    setAudioFiles((prev) => [...prev, ...tempFiles])

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const getAudioDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio()
      audio.src = url
      audio.addEventListener("loadedmetadata", () => {
        resolve(audio.duration)
      })
    })
  }

  const handleDragStart = (index: number) => {
    setDraggedItem(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedItem === null) return
    
    // Don't do anything if dragging over the same item
    if (draggedItem === index) return
    
    const newAudioFiles = [...audioFiles]
    const draggedItemContent = newAudioFiles[draggedItem]
    
    // Remove the dragged item
    newAudioFiles.splice(draggedItem, 1)
    // Insert it at the new position
    newAudioFiles.splice(index, 0, draggedItemContent)
    
    setAudioFiles(newAudioFiles)
    setDraggedItem(index)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
  }

  const removeAudioFile = (id: string) => {
    setAudioFiles((prev) => {
      const newFiles = prev.filter((file) => file.id !== id)
      return newFiles
    })
  }

  const addBreakpoint = (fileId: string, time: number) => {
    setAudioFiles((prev) =>
      prev.map((file) => {
        if (file.id === fileId) {
          // Add breakpoint if it doesn't already exist
          if (!file.breakpoints.includes(time)) {
            const newBreakpoints = [...file.breakpoints, time].sort((a, b) => a - b)
            return { ...file, breakpoints: newBreakpoints }
          }
        }
        return file
      }),
    )
  }

  const removeBreakpoint = (fileId: string, time: number) => {
    setAudioFiles((prev) =>
      prev.map((file) => {
        if (file.id === fileId) {
          return {
            ...file,
            breakpoints: file.breakpoints.filter((bp) => bp !== time),
          }
        }
        return file
      }),
    )
  }

  // Function to save an audio file (upload original file with breakpoints metadata)
  const saveAudioFile = async (fileId: string) => {
    // Find the file
    const audioFile = audioFiles.find((file) => file.id === fileId)
    if (!audioFile) return

    // Mark as uploading
    setAudioFiles((prev) => prev.map((file) => (file.id === fileId ? { ...file, uploading: true } : file)))

    try {
      // Create chunks based on breakpoints
      const breakpoints = [0, ...audioFile.breakpoints, audioFile.duration]
      const chunks: AudioChunk[] = []

      // Create chunk objects
      for (let i = 0; i < breakpoints.length - 1; i++) {
        const startTime = breakpoints[i]
        const endTime = breakpoints[i + 1]

        chunks.push({
          id: `chunk-${audioFile.id}-${i}`,
          startTime,
          endTime,
          duration: endTime - startTime,
        })
      }

      // Upload the original file with breakpoints metadata
      const formData = new FormData()

      // Important: Append the actual file with its original name
      formData.append("file", audioFile.file, audioFile.fileName)

      // Add breakpoints metadata
      formData.append(
        "breakpoints",
        JSON.stringify({
          fileName: audioFile.fileName,
          duration: audioFile.duration,
          breakpoints: audioFile.breakpoints,
        }),
      )

      console.log("Uploading file:", {
        fileName: audioFile.fileName,
        fileSize: audioFile.file.size,
        fileType: audioFile.file.type,
        breakpoints: audioFile.breakpoints.length,
      })

      // Upload the file using the API route instead of server action
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        // Update the file with the uploaded info and chunks
        setAudioFiles((prev) =>
          prev.map((file) =>
            file.id === fileId
              ? {
                  ...file,
                  uploading: false,
                  uploaded: true,
                  storageKey: result.key || "",
                  storageUrl: result.url || "",
                  chunks: chunks,
                }
              : file,
          ),
        )

        toast({
          title: "File uploaded successfully",
          description: `${audioFile.fileName} has been uploaded with ${audioFile.breakpoints.length} breakpoints.`,
        })
      } else {
        throw new Error(`Failed to upload file: ${result.error}`)
      }
    } catch (error) {
      console.error("Error processing file:", error)

      // Mark as failed
      setAudioFiles((prev) => prev.map((file) => (file.id === fileId ? { ...file, uploading: false } : file)))

      toast({
        title: "Upload failed",
        description: `Failed to upload ${audioFile.fileName}. ${error instanceof Error ? error.message : ""}`,
        variant: "destructive",
      })
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)

    try {
      // Check if any files are still uploading
      const stillUploading = audioFiles.some((file) => file.uploading)
      if (stillUploading) {
        throw new Error("Please wait for all files to finish uploading")
      }

      // Check if any files haven't been processed yet
      const unprocessedFiles = audioFiles.filter((file) => !file.uploaded)
      if (unprocessedFiles.length > 0) {
        // Upload all unprocessed files first
        await Promise.all(unprocessedFiles.map(file => saveAudioFile(file.id)))
      }

      // Prepare data for backend - array of objects with supabaseUrl and breakpoints
      const audioBreakpoints = audioFiles.map((file) => ({
        supabase_url: file.storageUrl,
        breakpoints: file.breakpoints,
      }))

      // Create the request payload according to the FastAPI model
      const requestPayload = {
        data: audioBreakpoints,
        combine_videos: false,
        output_dir: "output_videos"
      }

      // Set the debug data to show what we're sending
      setDebugData(JSON.stringify(requestPayload, null, 2))

      // Send the request to the FastAPI endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/video/process-and-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API error: ${errorData.detail || response.statusText}`);
      }

      const result = await response.json();
      console.log("API response:", result);

      toast({
        title: "Project submitted successfully",
        description: "Your audio files and breakpoints have been sent for processing.",
      })

      // You could update the debug data to show the response as well
      setDebugData(prev => prev + "\n\nResponse:\n" + JSON.stringify(result, null, 2))
    } catch (error) {
      console.error("Error submitting project:", error)
      toast({
        title: "Error submitting project",
        description:
          error instanceof Error ? error.message : "There was a problem submitting your project. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      audioFiles.forEach((file) => {
        URL.revokeObjectURL(file.url)
      })
    }
  }, [])

  const totalDuration = audioFiles.reduce((acc, file) => acc + file.duration, 0)

  const addEvenBreakpoints = (fileId: string, count: number) => {
    if (count <= 0) return;
    
    const audioFile = audioFiles.find(file => file.id === fileId);
    if (!audioFile) return;
    
    const duration = audioFile.duration;
    const interval = duration / (count + 1);
    
    // Clear existing breakpoints first
    setAudioFiles(prev => 
      prev.map(file => 
        file.id === fileId ? { ...file, breakpoints: [] } : file
      )
    );
    
    // Add new evenly distributed breakpoints
    const newBreakpoints: number[] = [];
    for (let i = 1; i <= count; i++) {
      const time = interval * i;
      newBreakpoints.push(time);
    }
    
    // Update the file with new breakpoints
    setAudioFiles(prev => 
      prev.map(file => 
        file.id === fileId ? { ...file, breakpoints: newBreakpoints as number[] } : file
      )
    );
  }

  const updateCurrentTime = (fileId: string, time: number) => {
    setAudioFiles(prev => 
      prev.map(file => 
        file.id === fileId ? { ...file, currentTime: time } : file
      )
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">AI Video Editor</h1>
        <Button variant="outline" onClick={() => router.push("/my-videos")} className="flex items-center gap-2">
          <FileAudio size={16} />
          My Videos
        </Button>
      </div>

      <Card className="p-6 mb-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Audio Tracks</h2>
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="audio/mp3,audio/*"
                multiple
                className="hidden"
                id="audio-upload"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                Add Audio
              </Button>
            </div>
          </div>

          {audioFiles.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg border-gray-300 dark:border-gray-700">
              <p className="text-muted-foreground">Upload MP3 files to start editing</p>
              <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="mt-4">
                Upload Files
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {audioFiles.map((audio, index) => (
                <div
                  key={audio.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`border rounded-lg p-4 bg-card w-full ${draggedItem === index ? 'opacity-50' : ''}`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2 max-w-[70%]">
                      <GripVertical size={16} className="cursor-move text-muted-foreground" />
                      <h3 className="font-medium truncate">{audio.fileName}</h3>
                      {audio.uploading && (
                        <div className="flex items-center text-amber-500">
                          <Loader2 size={14} className="animate-spin mr-1" />
                          <span className="text-xs">Processing...</span>
                        </div>
                      )}
                      {audio.uploaded && (
                        <span className="text-xs text-green-600 font-medium">Processed ✓</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{formatTime(audio.duration)}</span>

                      {/* Save button - show for all files that aren't already uploaded */}
                      {!audio.uploaded && !audio.uploading && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => saveAudioFile(audio.id)}
                          className="h-8 flex items-center gap-1"
                        >
                          <Upload size={14} />
                          <span>Save</span>
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAudioFile(audio.id)}
                        className="h-8 w-8"
                        disabled={audio.uploading}
                      >
                        <X size={16} />
                      </Button>
                    </div>
                  </div>

                  <AudioTrack
                    audio={audio}
                    onAddBreakpoint={(time) => addBreakpoint(audio.id, time)}
                    onRemoveBreakpoint={(time) => removeBreakpoint(audio.id, time)}
                    totalDuration={totalDuration}
                    disabled={audio.uploading || audio.uploaded}
                    onTimeUpdate={(time) => updateCurrentTime(audio.id, time)}
                  />

                  {/* Add a separate controls section for breakpoint management */}
                  <div className="mt-3 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {audio.breakpoints.length > 0 ? (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Flag size={14} className="text-green-600" />
                          <span>{audio.breakpoints.length} breakpoints</span>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Flag size={14} />
                          <span>No breakpoints</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <select
                        className="h-7 rounded border text-xs bg-background px-2"
                        onChange={(e) => {
                          const count = Number.parseInt(e.target.value);
                          if (!isNaN(count)) {
                            addEvenBreakpoints(audio.id, count);
                          }
                          e.target.value = "";
                        }}
                        disabled={audio.uploading || audio.uploaded}
                        value=""
                      >
                        <option value="" disabled>
                          Auto split
                        </option>
                        <option value="1">2 segments</option>
                        <option value="2">3 segments</option>
                        <option value="3">4 segments</option>
                        <option value="5">6 segments</option>
                        <option value="10">11 segments</option>
                      </select>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const file = audioFiles.find(f => f.id === audio.id);
                          if (file) {
                            // Use the tracked currentTime if available, otherwise use 0
                            const time = file.currentTime !== undefined ? file.currentTime : 0;
                            addBreakpoint(audio.id, time);
                          }
                        }}
                        className="h-7 flex items-center gap-1"
                        disabled={audio.uploading || audio.uploaded}
                      >
                        <Scissors size={14} />
                        <span className="text-xs">Add Breakpoint</span>
                      </Button>
                    </div>
                  </div>

                  {/* Show breakpoints summary if any */}
                  {audio.breakpoints.length > 0 && (
                    <div className="mt-4 border-t pt-3">
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <Layers size={14} className="text-indigo-500" />
                        <span>Breakpoints:</span>
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {audio.breakpoints.map((time) => (
                          <div key={time} className="text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                            {formatTime(time)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {audioFiles.length > 0 && (
            <div className="flex justify-end mt-4">
              <Button
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  audioFiles.some((file) => file.uploading) ||
                  audioFiles.some((file) => !file.uploaded)
                }
                className="flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Submit Project
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {audioFiles.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Project Summary</h2>
          <div className="space-y-2">
            <p>
              <strong>Total Tracks:</strong> {audioFiles.length}
            </p>
            <p>
              <strong>Total Duration:</strong> {formatTime(totalDuration)}
            </p>
            <p>
              <strong>Total Breakpoints:</strong> {audioFiles.reduce((acc, file) => acc + file.breakpoints.length, 0)}
            </p>
          </div>
        </Card>
      )}

      {debugData && (
        <Card className="p-6 mt-4 bg-slate-50 dark:bg-slate-900 border-amber-500">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-amber-600">Debug: API Payload</h2>
            <Button variant="outline" size="sm" onClick={() => setDebugData(null)}>
              Clear
            </Button>
          </div>
          <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded-md overflow-auto max-h-[400px] text-xs">
            {debugData}
          </pre>
        </Card>
      )}
    </div>
  )
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

