import { createReadStream } from "./createReadStream.ts";

function fibonacci(n: number): number {
  if (n <= 0) return 0;
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Define URL patterns
const apiPattern = new URLPattern({ pathname: "/:endpoint/:param?" });

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const match = apiPattern.exec(url);

    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const { endpoint, param } = match.pathname.groups;

    switch (endpoint) {
      case "json-small": {
        return new Response(JSON.stringify({ message: "Hello World!" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case "fibonacci-blocker": {
        console.log("fibonacci endpoint called");
        if (isNaN(Number(param))) {
          return new Response("400 Bad Request\n", {
            status: 400,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return new Response(fibonacci(Number(param)).toString(), {
          headers: { "Content-Type": "text/plain" },
        });
      }

      case "fibonacci-non-blocking": {
        console.log("fibonacci non-blocking endpoint called");
        if (isNaN(Number(param))) {
          return new Response("400 Bad Request\n", {
            status: 400,
            headers: { "Content-Type": "text/plain" },
          });
        }
        const worker = new Worker(new URL("./fibonacci.worker.ts", import.meta.url).href, {
          type: "module",
        });
        const result = await new Promise<number>((resolve) => {
          worker.onmessage = (e) => resolve(e.data);
          worker.postMessage(Number(param));
        });
        worker.terminate();
        return new Response(result.toString(), {
          headers: { "Content-Type": "text/plain" },
        });
      }

      case "fibonacci-parallel": {
        console.log("fibonacci parallel endpoint called");
        if (isNaN(Number(param))) {
          return new Response("400 Bad Request\n", {
            status: 400,
            headers: { "Content-Type": "text/plain" },
          });
        }

        const workers = Array.from({ length: 4 }, () =>
          new Worker(new URL("./fibonacci.worker.ts", import.meta.url).href, {
            type: "module",
          })
        );

        const values = await Promise.all(
          workers.map((worker, index) =>
            new Promise((resolve) => {
              worker.onmessage = (e) => resolve(e.data);
              worker.postMessage(Number(param) - index);
            })
          )
        );

        workers.forEach((worker) => worker.terminate());
        return new Response(JSON.stringify(values), {
          headers: { "Content-Type": "text/plain" },
        });
      }

      case "video-serving": {
        console.log("video serving endpoint called");
        const filePath = new URL("../resources/video.mp4", import.meta.url);
        const file = await Deno.open(filePath);
        const fileInfo = await file.stat();
        const rangeHeader = req.headers.get("range");

        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileInfo.size - 1;
          const chunksize = end - start + 1;
          const file = await createReadStream(filePath, { start, end });
          const head = {
            "Content-Range": `bytes ${start}-${end}/${fileInfo.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": `${chunksize}`,
            "Content-Type": "video/mp4",
          };

          return new Response(file, { status: 206, headers: head });
        } else {
          const head = {
            "Content-Length": `${fileInfo.size}`,
            "Content-Type": "video/mp4",
          };
          return new Response(file.readable, { headers: head });
        }
      }

      case "memory-intensive": {
        console.log("memory intensive endpoint called");
        if (isNaN(Number(param))) {
          return new Response("400 Bad Request\n", {
            status: 400,
            headers: { "Content-Type": "text/plain" },
          });
        }

        const multiplier = Number(param);
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
          return new Response(`Error during memory-intensive operation: ${error instanceof Error ? error.message : 'Unknown error'}`, {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
      }

      case "json-processing": {
        console.log("json-processing endpoint called");
        const jsonMultiplier = Number(param) || 1;
        const numberOfElements = jsonMultiplier * 100000;
        console.log(`Generating an array with ${numberOfElements} elements`);

        const largeArray = Array.from({ length: numberOfElements }, (_, i) => ({
          id: i,
          value: Math.random(),
        }));

        const jsonString = JSON.stringify(largeArray);
        const parsedData = JSON.parse(jsonString);

        return new Response(JSON.stringify(parsedData), {
          headers: { "Content-Type": "application/json" },
        });
      }

      default: {
        return new Response("Not found", { status: 404 });
      }
    }
  },
} satisfies Deno.ServeDefaultExport;
