"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Play, Clock, Flag, FileAudio, X } from "lucide-react"
import { createClient } from "@supabase/supabase-js"

type Video = {
  id: string
  created_at: string
  original_url: string
  preview_url: string
  breakpoints: number[]
  breakpoints_total: number
  breakpoints_completed: number
  status: string
  updated_at: string
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)

  useEffect(() => {
    async function fetchVideos() {
      try {
        setLoading(true)
        
        // Initialize Supabase client
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
        
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error("Supabase credentials not configured")
        }
        
        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        
        // Fetch videos from the videos table
        const { data, error } = await supabase
          .from('videos')
          .select('*')
          .order('created_at', { ascending: false })
        
        if (error) {
          throw error
        }
        
        setVideos(data || [])
      } catch (err) {
        console.error("Error fetching videos:", err)
        setError(err instanceof Error ? err.message : "Failed to load videos")
      } finally {
        setLoading(false)
      }
    }

    fetchVideos()
  }, [])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Videos</h1>
        <Button variant="outline" onClick={() => window.location.href = "/"} className="flex items-center gap-2">
          <FileAudio size={16} />
          Create New
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading your videos...</span>
        </div>
      ) : error ? (
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : videos.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <p className="text-muted-foreground mb-4">You haven't created any videos yet.</p>
            <Button onClick={() => window.location.href = "/"}>Create Your First Video</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <Card key={video.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg truncate">Video {video.id.substring(0, 8)}</CardTitle>
                <p className="text-sm text-muted-foreground">{formatDate(video.created_at)}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock size={16} />
                      <span className="text-sm">Created: {formatDate(video.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Flag size={16} />
                      <span className="text-sm">{video.breakpoints_total} breakpoints</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className={`px-2 py-1 text-xs rounded-full ${
                      video.status === 'completed' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                        : video.status === 'processing' 
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {video.status}
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      {video.breakpoints_completed}/{video.breakpoints_total} completed
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                    <div 
                      className="h-full bg-primary absolute top-0 left-0"
                      style={{ 
                        width: `${video.breakpoints_total > 0 
                          ? (video.breakpoints_completed / video.breakpoints_total) * 100 
                          : 0}%` 
                      }}
                    />
                    {video.breakpoints && video.breakpoints.map((breakpoint, index) => (
                      <div
                        key={index}
                        className="absolute h-2 w-0.5 bg-primary-foreground z-10"
                        style={{
                          left: `${(index + 1) / (video.breakpoints.length + 1) * 100}%`,
                          transform: "translateX(-50%)",
                        }}
                      />
                    ))}
                  </div>

                  <div className="flex justify-between gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setSelectedVideo(video)}>
                      Details
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 flex items-center gap-1"
                      onClick={() => window.open(video.preview_url || video.original_url, "_blank")}
                      disabled={!video.preview_url && !video.original_url}
                    >
                      <Play size={14} />
                      Play
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedVideo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Video Details</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => setSelectedVideo(null)}
              >
                <X size={16} />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {selectedVideo.preview_url && (
                  <div>
                    <h3 className="font-medium mb-2">Preview</h3>
                    <audio src={selectedVideo.preview_url} controls className="w-full" />
                  </div>
                )}

                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-medium">Breakpoints</h3>
                  {!selectedVideo.breakpoints || selectedVideo.breakpoints.length === 0 ? (
                    <p className="text-muted-foreground">No breakpoints data available</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedVideo.breakpoints.map((time, index) => (
                        <div
                          key={index}
                          className="bg-secondary text-secondary-foreground rounded-full px-2 py-1 text-xs"
                        >
                          {formatTime(time)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-medium">File Details</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">ID</div>
                    <div>{selectedVideo.id}</div>
                    
                    <div className="text-muted-foreground">Created</div>
                    <div>{formatDate(selectedVideo.created_at)}</div>
                    
                    <div className="text-muted-foreground">Updated</div>
                    <div>{formatDate(selectedVideo.updated_at)}</div>
                    
                    <div className="text-muted-foreground">Status</div>
                    <div>{selectedVideo.status}</div>
                    
                    <div className="text-muted-foreground">Breakpoints</div>
                    <div>{selectedVideo.breakpoints_completed} / {selectedVideo.breakpoints_total}</div>

                    {selectedVideo.original_url && (
                      <>
                        <div className="text-muted-foreground">Original URL</div>
                        <div className="truncate">
                          <a
                            href={selectedVideo.original_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {selectedVideo.original_url}
                          </a>
                        </div>
                      </>
                    )}
                    
                    {selectedVideo.preview_url && (
                      <>
                        <div className="text-muted-foreground">Preview URL</div>
                        <div className="truncate">
                          <a
                            href={selectedVideo.preview_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {selectedVideo.preview_url}
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}