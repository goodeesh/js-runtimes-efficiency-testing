// index.ts
import { serve } from "bun";
import { createReadStream } from "./createReadStream";

function fibonacci(n: number): number {
  if (n <= 0) return 0;
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const server = serve({
  port: 5000,
  async fetch(req) {
    const url = new URL(req.url);
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    const firstParam = url.pathname.split("/")[1];
    const secondParam = url.pathname.split("/")[2];

    switch (firstParam) {
      case "json-small": {
        return new Response(JSON.stringify({ message: "Hello World!" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case "fibonacci-blocker": {
        // CPU-intensive task on the main thread (blocking)
        console.log("fibonacci endpoint called");
        if (isNaN(Number(secondParam))) {
          return new Response("400 Bad Request\n", { status: 400 });
        }
        const result = fibonacci(Number(secondParam));
        return new Response(result.toString(), {
          headers: { "Content-Type": "text/plain" },
        });
      }

      case "fibonacci-non-blocking": {
        // CPU-intensive task offloaded to a worker thread
        console.log("fibonacci non-blocking endpoint called");
        if (isNaN(Number(secondParam))) {
          return new Response("400 Bad Request\n", { status: 400 });
        }
        const worker = new Worker("./fibonacci.worker.ts");
        
        const result = await new Promise<number>((resolve) => {
          worker.onmessage = (e) => resolve(e.data);
          worker.postMessage(secondParam);
        });
        
        worker.terminate();
        return new Response(result.toString(), {
          headers: { "Content-Type": "text/plain" },
        });
      }

      case "fibonacci-parallel": {
        // Using multiple worker threads for parallel computation
        console.log("fibonacci parallel endpoint called");
        if (isNaN(Number(secondParam))) {
          return new Response("400 Bad Request\n", { status: 400 });
        }
        const worker1 = new Worker("./fibonacci.worker.ts");
        const worker2 = new Worker("./fibonacci.worker.ts");
        const worker3 = new Worker("./fibonacci.worker.ts");
        const worker4 = new Worker("./fibonacci.worker.ts");

        const results = await Promise.all([
          new Promise((resolve) => {
            worker1.onmessage = (e) => resolve(e.data);
            worker1.postMessage(secondParam);
          }),
          new Promise((resolve) => {
            worker2.onmessage = (e) => resolve(e.data);
            worker2.postMessage(Number(secondParam) - 1);
          }),
          new Promise((resolve) => {
            worker3.onmessage = (e) => resolve(e.data);
            worker3.postMessage(Number(secondParam) - 2);
          }),
          new Promise((resolve) => {
            worker4.onmessage = (e) => resolve(e.data);
            worker4.postMessage(Number(secondParam) - 3);
          }),
        ]);

        worker1.terminate();
        worker2.terminate();
        worker3.terminate();
        worker4.terminate();

        return new Response(JSON.stringify(results), {
          headers: { "Content-Type": "text/plain" },
        });
      }
      case "video-serving": {
        console.log("video serving endpoint called");
        const filePath = "../resources/video.mp4";
        const file = Bun.file(filePath);
        const fileSize = (await file.size);
      
        const range = req.headers.get("range");
        if (range) {
          const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
          const start = parseInt(startStr, 10);
          const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      
          // Validate the range
          if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize) {
            return new Response("Range Not Satisfiable", {
              status: 416,
              headers: {
                "Content-Range": `bytes */${fileSize}`,
              },
            });
          }
      
          const chunkSize = end - start + 1;
      
          // Create a sliced stream
          const slicedStream = await createReadStream(filePath, { start, end });
      
          return new Response(slicedStream, {
            status: 206,
            headers: {
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunkSize.toString(),
              "Content-Type": "video/mp4",
            },
          });
        } else {
          // Full file request
          return new Response(file, {
            headers: {
              "Content-Length": fileSize.toString(),
              "Content-Type": "video/mp4",
            },
          });
        }
      }

      case "memory-intensive": {
        // Memory-intensive endpoint
        console.log("memory intensive endpoint called");
        if (isNaN(Number(secondParam))) {
          return new Response("400 Bad Request\n", { status: 400 });
        }
        const multiplier = Number(secondParam);
        const numElements = multiplier * 10_000_000;
        console.log(`Allocating an array with ${numElements} elements`);

        try {
          const largeArray = new Array(numElements);
          for (let i = 0; i < numElements; i++) {
            largeArray[i] = Math.random();
          }
          largeArray.sort((a, b) => a - b);
          const total = largeArray.reduce((acc, val) => acc + val, 0);
          return new Response(`Memory intensive operation completed. Sum: ${total}`, {
            headers: { "Content-Type": "text/plain" },
          });
        } catch (error: unknown) {
          return new Response(`Error during memory-intensive operation: ${error instanceof Error ? error.message : String(error)}`, {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
      }

      case "json-processing": {
        console.log("json-processing endpoint called");
        const jsonMultiplier = Number(secondParam) || 1;
        const numberOfElements = jsonMultiplier * 100000;
        console.log(`Generating an array with ${numberOfElements} elements`);

        const largeArray = [];
        for (let i = 0; i < numberOfElements; i++) {
          largeArray.push({ id: i, value: Math.random() });
        }

        const jsonString = JSON.stringify(largeArray);
        const parsedData = JSON.parse(jsonString);

        return new Response(JSON.stringify(parsedData), {
          headers: { "Content-Type": "application/json" },
        });
      }

      default: {
        return new Response("404 Not Found\n", { status: 404 });
      }
    }
  },
});

console.log(`Server is running on http://localhost:${server.port}`);