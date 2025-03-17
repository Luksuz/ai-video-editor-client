"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Play, Pause, Upload, Save, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

type Video = {
  id: string
  created_at: string
  original_url: string
  preview_url: string
  breakpoints: number[]
  chunks_total: number
  chunks_completed: number
  status: string
  updated_at: string
  video_urls: string[] // Array of Supabase paths
}

type VideoChunk = {
  id: string
  url: string
  thumbnailUrl?: string
  index: number
  duration: number
  hasError?: boolean
}

// Add this type for custom videos
type CustomVideo = {
  id: string
  url: string
  name: string
  created_at: string
}

// Add these types for drag and drop
type DragItem = {
  type: 'custom-video'
  id: string
  url: string
}

const CHUNKS_PER_PAGE = 10

export default function EditVideoPage() {
  const params = useParams()
  const router = useRouter()
  const videoId = params.id as string
  const [video, setVideo] = useState<Video | null>(null)
  const [chunks, setChunks] = useState<VideoChunk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({})
  const [supabase, setSupabase] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [displayedChunks, setDisplayedChunks] = useState<VideoChunk[]>([])
  // Add state for custom videos
  const [customVideos, setCustomVideos] = useState<CustomVideo[]>([])
  // Add state for drag and drop
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  useEffect(() => {
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    
    if (!supabaseUrl || !supabaseAnonKey) {
      setError("Supabase credentials not configured")
      return
    }
    
    const client = createClient(supabaseUrl, supabaseAnonKey)
    setSupabase(client)
  }, [])

  useEffect(() => {
    async function fetchVideoData() {
      if (!supabase) return
      
      try {
        setLoading(true)
        
        // Fetch video details
        const { data: videoData, error: videoError } = await supabase
          .from('videos')
          .select('*')
          .eq('id', videoId)
          .single()
        
        if (videoError) throw videoError
        
        setVideo(videoData)
        
        // Process video_urls into chunks
        if (videoData.video_urls && Array.isArray(videoData.video_urls)) {
          const processedChunks = videoData.video_urls.map((url: string, index: number) => {
            // Clean up the URL if it contains duplicated Supabase paths
            let cleanUrl = url;
            
            // Check if the URL contains the storage URL twice
            const storageBaseUrl = "https://qfpjbgjxkpwtsegtkaze.supabase.co/storage/v1/object/public/";
            if (url.includes(storageBaseUrl) && url.indexOf(storageBaseUrl) !== url.lastIndexOf(storageBaseUrl)) {
              // Extract the actual path after the second occurrence of the storage base URL
              const secondBaseUrlIndex = url.lastIndexOf(storageBaseUrl);
              cleanUrl = url.substring(0, secondBaseUrlIndex) + url.substring(secondBaseUrlIndex).split('?')[0];
            }
            
            console.log(`Original URL: ${url}`);
            console.log(`Cleaned URL: ${cleanUrl}`);
            
            // Create a chunk object using the cleaned URL
            return {
              id: `chunk-${index}`,
              url: cleanUrl,
              index,
              duration: 0,
            }
          });
          
          // Filter out chunks with empty URLs
          const validChunks = processedChunks.filter((chunk: VideoChunk) => chunk.url && chunk.url.trim() !== "")
          console.log("Valid chunks:", validChunks.length)
          
          setChunks(validChunks)
          setTotalPages(Math.ceil(validChunks.length / CHUNKS_PER_PAGE))
        }
      } catch (err) {
        console.error("Error fetching video data:", err)
        setError(err instanceof Error ? err.message : "Failed to load video data")
      } finally {
        setLoading(false)
      }
    }

    if (videoId && supabase) {
      fetchVideoData()
    }
  }, [videoId, supabase])

  useEffect(() => {
    const startIndex = currentPage * CHUNKS_PER_PAGE
    const endIndex = startIndex + CHUNKS_PER_PAGE
    setDisplayedChunks(chunks.slice(startIndex, endIndex))
  }, [currentPage, chunks])

  // Add this effect to fetch custom videos
  useEffect(() => {
    async function fetchCustomVideos() {
      if (!supabase || !videoId) return
      
      try {
        // List all files in the audio-files bucket for this video ID
        const { data, error } = await supabase
          .storage
          .from('audio-files')
          .list(`${videoId}`, {
            sortBy: { column: 'created_at', order: 'desc' }
          })
        
        if (error) {
          console.error("Error fetching custom videos:", error)
          return
        }
        
        if (!data || data.length === 0) {
          setCustomVideos([])
          return
        }
        
        const customVideoData = await Promise.all(data.map(async (file: any) => {
          const { data: urlData } = await supabase
            .storage
            .from('audio-files')
            .getPublicUrl(`${videoId}/${file.name}`)
          
          return {
            id: file.id,
            url: urlData?.publicUrl || "",
            name: file.name,
            created_at: file.created_at || new Date().toISOString()
          }
        }))
        
        setCustomVideos(customVideoData)
      } catch (err) {
        console.error("Error processing custom videos:", err)
      }
    }
    
    fetchCustomVideos()
  }, [supabase, videoId])

  const handlePlayPause = (chunkId: string) => {
    if (currentlyPlaying === chunkId) {
      // Pause the currently playing audio
      if (audioRefs.current[chunkId]) {
        audioRefs.current[chunkId]?.pause()
      }
      setCurrentlyPlaying(null)
    } else {
      // Pause any currently playing audio
      if (currentlyPlaying && audioRefs.current[currentlyPlaying]) {
        audioRefs.current[currentlyPlaying]?.pause()
      }
      
      // Play the selected audio
      if (audioRefs.current[chunkId]) {
        audioRefs.current[chunkId]?.play()
      }
      setCurrentlyPlaying(chunkId)
    }
  }

  const handleAudioEnded = (chunkId: string) => {
    setCurrentlyPlaying(null)
  }

  // Update the handleFileUpload function to avoid page reload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase) {
      toast({
        title: "Error",
        description: "Supabase client not initialized",
        variant: "destructive",
      })
      return
    }
    
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setUploadingFile(true)
      
      // Create a more descriptive file name
      const fileExt = file.name.split('.').pop()
      const fileName = `${videoId}/${Date.now()}-${file.name}`
      
      console.log("Uploading file:", {
        fileName,
        fileSize: file.size,
        fileType: file.type
      })
      
      // Upload file to Supabase storage
      const { data, error } = await supabase
        .storage
        .from('audio-files') // Make sure this bucket exists
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true // Changed to true to overwrite if file exists
        })
      
      if (error) {
        console.error("Upload error:", error)
        throw new Error(`Upload failed: ${error.message}`)
      }
      
      console.log("Upload successful:", data)
      
      // Get the public URL for the uploaded file
      const { data: publicUrlData } = await supabase
        .storage
        .from('audio-files')
        .getPublicUrl(fileName)
      
      if (!publicUrlData || !publicUrlData.publicUrl) {
        throw new Error("Failed to get public URL for uploaded file")
      }
      
      console.log("Public URL:", publicUrlData.publicUrl)
      
      // Add the new custom video to state
      const newVideo = {
        id: Date.now().toString(),
        url: publicUrlData.publicUrl,
        name: file.name,
        created_at: new Date().toISOString()
      }
      
      setCustomVideos(prev => [newVideo, ...prev])
      
      toast({
        title: "File uploaded successfully",
        description: "Your custom video has been uploaded.",
      })
      
    } catch (err) {
      console.error("Error uploading file:", err)
      toast({
        title: "Error uploading file",
        description: err instanceof Error ? err.message : "There was a problem uploading your file.",
        variant: "destructive",
      })
    } finally {
      setUploadingFile(false)
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1)
    }
  }

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleAudioError = (chunkId: string) => {
    // Skip logging and just update the state
    setChunks(prev => 
      prev.map(c => 
        c.id === chunkId 
          ? { ...c, hasError: true } 
          : c
      )
    );
  }

  // Add drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, video: CustomVideo) => {
    // Set the data that will be transferred
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'custom-video',
      id: video.id,
      url: video.url
    }))
    
    // Set a drag image (optional)
    const dragImage = new Image()
    dragImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    e.dataTransfer.setDragImage(dragImage, 0, 0)
    
    // Update state
    setIsDragging(true)
    setDraggedItem({
      type: 'custom-video',
      id: video.id,
      url: video.url
    })
  }, [])
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    setDraggedItem(null)
    setDropTargetId(null)
  }, [])
  
  const handleDragOver = useCallback((e: React.DragEvent, chunkId: string) => {
    // Prevent default to allow drop
    e.preventDefault()
    setDropTargetId(chunkId)
  }, [])
  
  const handleDragLeave = useCallback(() => {
    setDropTargetId(null)
  }, [])
  
  const handleDrop = useCallback(async (e: React.DragEvent, chunkId: string) => {
    e.preventDefault()
    
    try {
      // Get the dragged data
      const data = JSON.parse(e.dataTransfer.getData('application/json')) as DragItem
      
      if (data.type === 'custom-video') {
        // Find the target chunk
        const targetChunk = chunks.find(chunk => chunk.id === chunkId)
        
        if (!targetChunk) {
          throw new Error("Target chunk not found")
        }
        
        // Show loading toast
        toast({
          title: "Processing videos",
          description: "Sending request to process the videos...",
        })
        
        // Send POST request to localhost API
        const response = await fetch('http://localhost:8000/video/replace-chunk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            custom_video_url: data.url,
            chunk_video_url: targetChunk.url,
            video_id: videoId,
            chunk_index: targetChunk.index
          }),
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || "Failed to process videos")
        }
        
        const result = await response.json()
        
        // Show success toast
        toast({
          title: "Request sent successfully",
          description: "The videos are being processed. This may take a few minutes.",
        })
        
        console.log("Process videos response:", result)
      }
    } catch (err) {
      console.error("Error processing drop:", err)
      toast({
        title: "Error processing videos",
        description: err instanceof Error ? err.message : "There was a problem processing the videos.",
        variant: "destructive",
      })
    }
    
    // Reset drag state
    setIsDragging(false)
    setDraggedItem(null)
    setDropTargetId(null)
  }, [chunks, videoId])

  if (loading) {
    return (
      <div className="container mx-auto py-12 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span>Loading video editor...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => router.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center mb-6">
        <Button variant="ghost" onClick={() => router.back()} className="mr-4">
          <ArrowLeft size={16} />
        </Button>
        <h1 className="text-3xl font-bold">Edit Video</h1>
      </div>

      {video && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Video {video.id.substring(0, 8)}</span>
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
              >
                {uploadingFile ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={16} className="mr-2" />
                    Upload New Audio
                  </>
                )}
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {video.preview_url && (
                <div>
                  <h3 className="font-medium mb-2">Full Preview</h3>
                  <audio src={video.preview_url} controls className="w-full" />
                </div>
              )}
              
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-4">Status: <span className="text-blue-600">{video.status}</span></h3>
                <p className="text-sm text-muted-foreground mb-2">
                  {video.chunks_completed} of {video.chunks_total} chunks processed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {customVideos.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Custom Uploaded Videos</span>
              <div className="text-sm text-muted-foreground">
                Drag videos to replace chunks below
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex overflow-x-auto pb-4 gap-4">
              {customVideos.map((video) => (
                <div 
                  key={video.id} 
                  className="border rounded-lg p-3 space-y-2 flex-shrink-0 cursor-move"
                  style={{ width: '200px' }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, video)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center overflow-hidden">
                    <video 
                      src={video.url}
                      className="w-full h-full object-cover"
                      controls
                      preload="metadata"
                    />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium truncate" title={video.name}>
                      {video.name.length > 15 ? video.name.substring(0, 12) + '...' : video.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(video.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Audio Chunks</span>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePrevPage} 
                disabled={currentPage === 0}
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm">
                Page {currentPage + 1} of {totalPages || 1}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleNextPage} 
                disabled={currentPage >= totalPages - 1}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chunks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No audio chunks available for this video yet.
            </p>
          ) : (
            <div className="space-y-6">
              <div className="flex overflow-x-auto pb-4 gap-4">
                {displayedChunks.map((chunk) => (
                  <div 
                    key={chunk.id} 
                    className={`border rounded-lg p-3 space-y-2 flex-shrink-0 ${
                      dropTargetId === chunk.id ? 'ring-2 ring-primary' : ''
                    }`}
                    style={{ width: '200px' }}
                    onDragOver={(e) => handleDragOver(e, chunk.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, chunk.id)}
                  >
                    <div className={`aspect-video bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center overflow-hidden ${
                      isDragging && dropTargetId === chunk.id ? 'bg-primary/20' : ''
                    }`}>
                      {currentlyPlaying === chunk.id ? (
                        <video 
                          ref={(el) => {
                            if (el) {
                              audioRefs.current[chunk.id] = el;
                            } else {
                              delete audioRefs.current[chunk.id];
                            }
                          }}
                          src={chunk.url}
                          className="w-full h-full object-cover"
                          onEnded={() => handleAudioEnded(chunk.id)}
                          onLoadedMetadata={(e) => {
                            const target = e.target as HTMLVideoElement;
                            setChunks(prev => 
                              prev.map(c => 
                                c.id === chunk.id 
                                  ? { ...c, duration: target.duration } 
                                  : c
                              )
                            );
                          }}
                          onError={() => handleAudioError(chunk.id)}
                          autoPlay
                          muted={false}
                          controls
                        />
                      ) : (
                        <div 
                          className="w-full h-full flex items-center justify-center cursor-pointer relative"
                          onClick={() => !chunk.hasError && handlePlayPause(chunk.id)}
                        >
                          {isDragging && dropTargetId === chunk.id ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-primary/20 z-10">
                              <p className="text-sm font-medium text-center">Drop to replace</p>
                            </div>
                          ) : null}
                          
                          {chunk.thumbnailUrl ? (
                            <img 
                              src={chunk.thumbnailUrl} 
                              alt={`Chunk ${chunk.index + 1}`} 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-muted-foreground text-sm text-center">
                              Video Chunk<br />{chunk.index + 1}
                            </div>
                          )}
                          <div className="absolute">
                            <Play size={24} className="text-white drop-shadow-md" />
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Chunk {chunk.index + 1}</span>
                      {chunk.duration > 0 && (
                        <span className="text-xs text-muted-foreground">{formatTime(chunk.duration)}</span>
                      )}
                    </div>
                    
                    <Button 
                      variant={chunk.hasError ? "destructive" : "outline"}
                      size="sm" 
                      className="w-full"
                      onClick={() => !chunk.hasError && handlePlayPause(chunk.id)}
                      disabled={!chunk.url || chunk.hasError}
                    >
                      {chunk.hasError ? (
                        "Video unavailable"
                      ) : currentlyPlaying === chunk.id ? (
                        <>
                          <Pause size={14} className="mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play size={14} className="mr-1" />
                          Play
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  Showing chunks {currentPage * CHUNKS_PER_PAGE + 1} to {Math.min((currentPage + 1) * CHUNKS_PER_PAGE, chunks.length)} of {chunks.length}
                </div>
                <Button className="flex items-center gap-2">
                  <Save size={16} />
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}