// index.ts
import { serve } from "bun";
import { createReadStream } from "./createReadStream";
import { Database } from "./CRUD.class";

function fibonacci(n: number): number {
  if (n <= 0) return 0;
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

enum endpoints {
  JSON_SMALL = "json-small",
  FIBONACCI_BLOCKER = "fibonacci-blocker",
  FIBONACCI_NON_BLOCKING = "fibonacci-non-blocking",
  FIBONACCI_PARALLEL = "fibonacci-parallel",
  VIDEO_SERVING = "video-serving",
  MEMORY_INTENSIVE = "memory-intensive",
  JSON_PROCESSING = "json-processing",
  INSERT_USER = "insertUser",
  DELETE_USER = "deleteUser",
  GET_USER = "getUser",
  UPDATE_USER = "updateUser"
}

const database = new Database();

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

    // Improved 404 response with endpoint list
    const endpointsList = Object.values(endpoints)
      .map(endpoint => `- /${endpoint}`)
      .join("\n");
      
    const notFoundResponse = new Response(`404 Not Found\n\nThe available endpoints are:\n${endpointsList}\n- /health (server health check)`, {
      status: 404,
      headers: { "Content-Type": "text/plain" }
    });

    switch (firstParam) {
      case endpoints.JSON_SMALL: {
        return new Response(JSON.stringify({ message: "Hello World!" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case endpoints.FIBONACCI_BLOCKER: {
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

      case endpoints.FIBONACCI_NON_BLOCKING: {
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

      case endpoints.FIBONACCI_PARALLEL: {
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
      case endpoints.VIDEO_SERVING: {
        console.log("video serving endpoint called");
        const filePath = "./resources/video.mp4";
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

      case endpoints.MEMORY_INTENSIVE: {
        // Memory-intensive endpoint
        console.log("memory intensive endpoint called");
        if (isNaN(Number(secondParam))) {
          return new Response("400 Bad Request\n", { status: 400 });
        }
        const multiplier = Number(secondParam);
        const numElements = multiplier * 1_000_000;
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

      case endpoints.JSON_PROCESSING: {
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

      // New database-related endpoints
      case endpoints.INSERT_USER: {
        console.log("insertUser endpoint called");
        try {
          const body = await req.json();
          const { username, password, email, name, surname, age } = body;
          
          if (!username || !password || !email || !name || !surname || !age) {
            return new Response("400 Bad Request\n", {
              status: 400,
              headers: { "Content-Type": "text/plain" },
            });
          }
          
          await database.insertUser(username, password, email, name, surname, age);
          console.log("User inserted successfully");
          
          return new Response("User inserted successfully\n", {
            headers: { "Content-Type": "text/plain" },
          });
        } catch (error) {
          console.error("Error inserting user:", error);
          return new Response("500 Internal Server Error\n", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
      }

      case endpoints.GET_USER: {
        console.log("getUser endpoint called");
        try {
          const body = await req.json();
          const { username } = body;
          
          if (!username) {
            return new Response("400 Bad Request\n", {
              status: 400,
              headers: { "Content-Type": "text/plain" },
            });
          }
          
          const user = database.getUser(username);
          console.log("User retrieved successfully");
          
          return new Response(JSON.stringify(user), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error retrieving user:", error);
          return new Response("500 Internal Server Error\n", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
      }

      case endpoints.UPDATE_USER: {
        console.log("updateUser endpoint called");
        try {
          const body = await req.json();
          const { username, password } = body;
          
          if (!username || !password) {
            return new Response("400 Bad Request\n", {
              status: 400,
              headers: { "Content-Type": "text/plain" },
            });
          }
          
          await database.updateUser(username, password);
          console.log("User updated successfully");
          
          return new Response("User updated successfully\n", {
            headers: { "Content-Type": "text/plain" },
          });
        } catch (error) {
          console.error("Error updating user:", error);
          return new Response("500 Internal Server Error\n", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
      }

      case endpoints.DELETE_USER: {
        console.log("deleteUser endpoint called");
        try {
          const body = await req.json();
          const { username } = body;
          
          if (!username) {
            return new Response("400 Bad Request\n", {
              status: 400,
              headers: { "Content-Type": "text/plain" },
            });
          }
          
          database.deleteUser(username);
          console.log("User deleted successfully");
          
          return new Response("User deleted successfully\n", {
            headers: { "Content-Type": "text/plain" },
          });
        } catch (error) {
          console.error("Error deleting user:", error);
          return new Response("500 Internal Server Error\n", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
      }

      default: {
        return notFoundResponse;
      }
    }
  },
});

console.log(`Server is running on http://localhost:${server.port}`);