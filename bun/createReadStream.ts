export async function createReadStream(
    filePath: string, options: { start?: number; end?: number }
): Promise<ReadableStream<Uint8Array>> {
    const file = Bun.file(filePath);
    const fileSize = await file.size;
    const start = options?.start || 0;
    const end = options?.end || fileSize - 1;  

    if (start >= fileSize || end >= fileSize) {
      throw new RangeError("Range Not Satisfiable");
    }

    // Create a sliced stream
    const fileStream = file.stream();
    const slicedStream = new ReadableStream({
      async start(controller) {
        const reader = fileStream.getReader();
        let offset = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
  
          const chunkStart = Math.max(start - offset, 0);
          const chunkEnd = Math.min(end - offset, value.length - 1);
  
          if (chunkStart < value.length && chunkEnd >= 0) {
            controller.enqueue(value.slice(chunkStart, chunkEnd + 1));
          }
  
          offset += value.length;
        }
        controller.close();
      },
    });
  
    return slicedStream;
  }