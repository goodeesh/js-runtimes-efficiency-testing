// index.ts
import { serve } from "bun";
import { createReadStream } from "./createReadStream";
import { Database } from "./CRUD.class";

enum endpoints {
  JSON_SMALL = "json-small",
  FIBONACCI_BLOCKER = "fibonacci-blocker",
  FIBONACCI_NON_BLOCKING = "fibonacci-non-blocking",
  FIBONACCI_PARALLEL = "fibonacci-parallel",
  VIDEO_SERVING = "video-serving",
  MEMORY_INTENSIVE = "memory-intensive",
  JSON_PROCESSING = "json-processing",
  CREATE_USER = "createUser",
  DELETE_USER = "deleteUser",
  GET_USER = "getUser",
  UPDATE_USER = "updateUser",
}

function fibonacci(n: number): number {
  if (n <= 0) return 0;
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const database = new Database();

const server = serve({
  port: 5000,
  async fetch(req) {
    if (!req.url) {
      return new Response("400 Bad Request\n", { status: 400 });
    }
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    const firstParam = url.pathname.split("/")[1];
    const secondParam = url.pathname.split("/")[2];

    switch (firstParam) {
      case endpoints.JSON_SMALL: {
        return new Response(JSON.stringify({ message: "Hello World!" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case endpoints.FIBONACCI_BLOCKER: {
        if (isNaN(Number(secondParam))) {
          return new Response("400 Bad Request\n", { status: 400 });
        }
        const result = fibonacci(Number(secondParam));
        return new Response(result.toString(), {
          headers: { "Content-Type": "text/plain" },
        });
      }

      case endpoints.FIBONACCI_NON_BLOCKING: {
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

      case endpoints.VIDEO_SERVING: {
        const filePath = "./resources/video.mp4";
        const file = Bun.file(filePath);
        const fileSize = await file.size;

        const range = req.headers.get("range");
        if (range) {
          const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
          const start = parseInt(startStr, 10);
          const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

          // Validate the range
          if (
            isNaN(start) ||
            isNaN(end) ||
            start >= fileSize ||
            end >= fileSize
          ) {
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
        const numElements = 100000;

        try {
          let total = 0;
          const chunkSize = 1000;

          for (let chunk = 0; chunk < numElements / chunkSize; chunk++) {
            const smallArray = new Array(chunkSize);
            for (let i = 0; i < chunkSize; i++) {
              smallArray[i] = Math.random();
            }
            total += smallArray.reduce((acc, val) => acc + val, 0);
          }

          return new Response(
            `Memory intensive operation completed. Sum: ${total}`,
            {
              headers: { "Content-Type": "text/plain" },
            }
          );
        } catch (error: unknown) {
          return new Response(
            `Error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            {
              status: 500,
              headers: { "Content-Type": "text/plain" },
            }
          );
        }
      }

      case endpoints.JSON_PROCESSING: {
        const jsonMultiplier = Number(secondParam) || 1;
        const numberOfElements = jsonMultiplier * 1000;
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

      case endpoints.CREATE_USER: {
        try {
          const body = await req.json();
          const { username, password, email, name, surname, age } = body;

          if (!username || !password || !email || !name || !surname || !age) {
            return new Response("400 Bad Request\n", {
              status: 400,
              headers: { "Content-Type": "text/plain" },
            });
          }

          await database.createUser(
            username,
            password,
            email,
            name,
            surname,
            age
          );

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
        const endpointsList = Object.values(endpoints)
          .map((endpoint) => `- /${endpoint}`)
          .join("\n");

        return new Response(
          `404 Not Found\n\nThe available endpoints are:\n${endpointsList}\n- /health (server health check)`,
          {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          }
        );
      }
    }
  },
});
