import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Configure Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
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

export async function POST(request: NextRequest) {
  try {
    // Validate environment variables
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase credentials:", {
        hasUrl: !!supabaseUrl,
        hasAnonKey: !!supabaseAnonKey,
      })
      return NextResponse.json(
        { success: false, error: "Supabase credentials not configured" },
        { status: 500 }
      )
    }

    // Create a Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Get the form data
    const formData = await request.formData()
    
    // Get the file and breakpoints data
    const audioFile = formData.get("file") as File
    const breakpointsJson = formData.get("breakpoints") as string

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      )
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
      return NextResponse.json(
        { success: false, error: "Failed to check storage buckets" },
        { status: 500 }
      )
    }

    const bucketExists = buckets.some((bucket) => bucket.name === "audio-files")

    // Create bucket if it doesn't exist
    if (!bucketExists) {
      const { error: createBucketError } = await supabase.storage.createBucket("audio-files", {
        public: true,
        fileSizeLimit: 100 * 1024 * 1024, // 100MB limit
      })

      if (createBucketError) {
        console.error("Error creating bucket:", createBucketError)
        return NextResponse.json(
          { success: false, error: "Failed to create storage bucket" },
          { status: 500 }
        )
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
      return NextResponse.json(
        { success: false, error: `Failed to upload audio file: ${fileError.message}` },
        { status: 500 }
      )
    }

    // Get the public URL
    const { data: urlData } = supabase.storage.from("audio-files").getPublicUrl(key)

    if (!urlData || !urlData.publicUrl) {
      return NextResponse.json(
        { success: false, error: "Failed to get public URL" },
        { status: 500 }
      )
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

    return NextResponse.json({
      success: true,
      key,
      url: urlData.publicUrl,
    })
  } catch (error) {
    console.error("Error uploading original audio:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      },
      { status: 500 }
    )
  }
}

export const config = {
  api: {
    bodyParser: false, // Disables body parsing, as we're handling the multipart form data manually
  },
} 