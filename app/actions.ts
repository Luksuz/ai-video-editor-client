"use server"

import { createClient } from "@supabase/supabase-js"

// Configure Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

// Generate a random hash without using crypto
function generateRandomHash(length = 32) {
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  const charactersLength = characters.length

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }

  return result
}

/**
 * Upload the original audio file directly to Supabase
 */
export async function uploadOriginalAudio(formData: FormData) {
  try {
    // Validate environment variables
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase credentials:", {
        hasUrl: !!supabaseUrl,
        hasAnonKey: !!supabaseAnonKey,
      })
      throw new Error("Supabase credentials not configured")
    }

    // Create a Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Get the file and breakpoints data
    const audioFile = formData.get("file") as File
    const breakpointsJson = formData.get("breakpoints") as string

    if (!audioFile) {
      throw new Error("No file provided")
    }

    // Generate a random hash for the file name
    const randomHash = generateRandomHash()
    const fileExtension = audioFile.name.split(".").pop()
    const key = `audio/original-${randomHash}.${fileExtension}`

    // Convert file to ArrayBuffer for upload
    const arrayBuffer = await audioFile.arrayBuffer()

    // Check if the bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()

    if (bucketsError) {
      console.error("Error listing buckets:", bucketsError)
      throw new Error("Failed to check storage buckets")
    }

    const bucketExists = buckets.some((bucket) => bucket.name === "audio-files")

    // Create bucket if it doesn't exist
    if (!bucketExists) {
      const { error: createBucketError } = await supabase.storage.createBucket("audio-files", {
        public: true,
        fileSizeLimit: 1000 * 1024 * 1024, // 100MB limit
      })

      if (createBucketError) {
        console.error("Error creating bucket:", createBucketError)
        throw new Error("Failed to create storage bucket")
      }
    }

    // Upload the audio file
    console.log("Uploading audio file:", {
      fileName: audioFile.name,
      fileSize: audioFile.size,
      fileType: audioFile.type,
      key,
    })

    const { data: fileData, error: fileError } = await supabase.storage.from("audio-files").upload(key, arrayBuffer, {
      contentType: audioFile.type || "audio/mpeg",
      cacheControl: "3600",
      upsert: true,
    })

    if (fileError) {
      console.error("File upload error:", fileError)
      throw new Error(`Failed to upload audio file: ${fileError.message}`)
    }

    // Get the public URL
    const { data: urlData } = supabase.storage.from("audio-files").getPublicUrl(key)

    if (!urlData || !urlData.publicUrl) {
      throw new Error("Failed to get public URL")
    }

    // Store metadata about breakpoints in a separate JSON file
    if (breakpointsJson) {
      try {
        const metadataKey = `audio/metadata-${randomHash}.json`

        // Parse the breakpoints JSON to make sure it's valid
        const breakpointsData = JSON.parse(breakpointsJson)

        // Upload the metadata as a JSON file
        const { error: metadataError } = await supabase.storage
          .from("audio-files")
          .upload(metadataKey, breakpointsJson, {
            contentType: "application/json",
            upsert: true,
          })

        if (metadataError) {
          console.warn("Failed to upload metadata, but continuing with main file upload:", metadataError)
        }
      } catch (metadataError) {
        console.error("Failed to process or upload metadata, but continuing:", metadataError)
        // Continue anyway - the main file was uploaded
      }
    }

    return {
      success: true,
      key,
      url: urlData.publicUrl,
    }
  } catch (error) {
    console.error("Error uploading original audio:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

// Function to fetch user videos
export async function fetchUserVideos() {
  try {
    // Validate environment variables
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase credentials not configured")
    }

    // Create a Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // List files in the audio-files bucket
    const { data: files, error } = await supabase.storage.from("audio-files").list("audio", {
      limit: 100,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    })

    if (error) {
      console.error("Error fetching files:", error)
      return {
        success: false,
        error: error.message,
      }
    }

    // Filter for original audio files
    const originalFiles = files.filter((file) => file.name.startsWith("original-"))

    // For each file, try to find its corresponding metadata file
    const videos = await Promise.all(
      originalFiles.map(async (file) => {
        const fileId = file.name.split("original-")[1].split(".")[0]
        const metadataFile = files.find((f) => f.name === `metadata-${fileId}.json`)

        // Get the public URL
        const { data: urlData } = supabase.storage.from("audio-files").getPublicUrl(`audio/${file.name}`)

        let metadata = {
          fileName: file.name.replace("original-", ""),
          duration: 0,
          breakpoints: [],
        }

        // If we found metadata, fetch and parse it
        if (metadataFile) {
          try {
            const { data: metadataContent, error: metadataError } = await supabase.storage
              .from("audio-files")
              .download(`audio/${metadataFile.name}`)

            if (metadataError) {
              console.error("Error downloading metadata:", metadataError)
            } else if (metadataContent) {
              const text = await metadataContent.text()
              const parsedMetadata = JSON.parse(text)
              metadata = {
                ...metadata,
                ...parsedMetadata,
              }
            }
          } catch (metadataError) {
            console.error("Error processing metadata for file:", file.name, metadataError)
            // Continue with default metadata
          }
        }

        return {
          id: fileId,
          fileName: metadata.fileName || file.name.replace("original-", ""),
          storageUrl: urlData?.publicUrl || "",
          createdAt: file.created_at || new Date().toISOString(),
          duration: metadata.duration || 0,
          breakpoints: metadata.breakpoints || [],
        }
      }),
    )

    return {
      success: true,
      videos,
    }
  } catch (error) {
    console.error("Error fetching user videos:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

// Type definition for the video response from the API
type VideoResponse = {
  video_id: string
  original_url: string
  preview_url: string
  processing_time: number
  success: boolean
  message: string
}

// Function to check video processing status
export async function checkVideoStatus(videoId: string) {
  try {
    // Validate environment variables
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase credentials not configured")
    }

    // Create a Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    
    // Query the videos table for the specific video
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single()
    
    if (error) {
      console.error("Error fetching video status:", error)
      return {
        success: false,
        error: error.message,
      }
    }
    
    return {
      success: true,
      video: data,
    }
  } catch (error) {
    console.error("Error checking video status:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}
