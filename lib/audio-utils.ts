// Replace the entire file with this simplified version that doesn't try to process audio in the browser

/**
 * Creates a metadata object for an audio chunk without actually processing the audio
 * This is a lightweight alternative to extracting actual audio chunks in the browser
 *
 * @param audioFile The original audio file
 * @param startTime Start time in seconds
 * @param endTime End time in seconds
 * @returns A Blob containing metadata about the chunk
 */
export async function extractAudioChunk(
  audioFile: File,
  startTime: number,
  endTime: number,
  chunkIndex: number,
): Promise<{ blob: Blob; metadata: any }> {
  // Create metadata object
  const metadata = {
    originalFileName: audioFile.name,
    fileType: audioFile.type,
    fileSize: audioFile.size,
    startTime,
    endTime,
    duration: endTime - startTime,
    chunkIndex,
    createdAt: new Date().toISOString(),
  }

  // Create a small metadata blob
  const metadataBlob = new Blob([JSON.stringify(metadata)], {
    type: "application/json",
  })

  return {
    blob: metadataBlob,
    metadata,
  }
}

