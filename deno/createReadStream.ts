// createReadStream from node.js is not implemented and results in a more low level implementation
// but once it is implemented, it is easy to hide it away and have a more node.js like function call
export async function createReadStream(
    filePath: string | URL,
    options?: { start?: number; end?: number }
  ): Promise<ReadableStream<Uint8Array>> {
    const file = await Deno.open(filePath);
    const fileInfo = await file.stat();
  
    const start = options?.start || 0;
    const end = options?.end || fileInfo.size - 1;
  
    return file.readable.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          const chunkStart = Math.max(start, 0);
          const chunkEnd = Math.min(end, chunk.byteLength - 1);
          controller.enqueue(chunk.slice(chunkStart, chunkEnd + 1));
        },
      })
    );
  }