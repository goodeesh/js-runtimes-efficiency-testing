import { createReadStream } from "./createReadStream.ts";
import { Database } from "./CRUD.class.ts";

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
  CREATE_USER = "createUser",
  DELETE_USER = "deleteUser",
  GET_USER = "getUser",
  UPDATE_USER = "updateUser",
}

// Initialize database first
const database = new Database();

// Define URL patterns
const apiPattern = new URLPattern({ pathname: "/:endpoint/:param?" });

// Start the server
Deno.serve({ port: 8000 }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // Health check endpoint
  if (url.pathname === "/health") {
    return new Response("OK", { status: 200 });
  }

  const match = apiPattern.exec(url);

  if (!match) {
    return new Response("400 Bad Request\n", { status: 400 });
  }

  const { endpoint, param } = match.pathname.groups;

  switch (endpoint) {
    case endpoints.JSON_SMALL: {
      return new Response(JSON.stringify({ message: "Hello World!" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    case endpoints.FIBONACCI_BLOCKER: {
      if (isNaN(Number(param))) {
        return new Response("400 Bad Request\n", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }
      const result = fibonacci(Number(param));
      return new Response(result.toString(), {
        headers: { "Content-Type": "text/plain" },
      });
    }

    case endpoints.FIBONACCI_NON_BLOCKING: {
      if (isNaN(Number(param))) {
        return new Response("400 Bad Request\n", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }
      const worker = new Worker(
        new URL("./fibonacci.worker.ts", import.meta.url).href,
        {
          type: "module",
        }
      );
      const result = await new Promise<number>((resolve) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.postMessage(Number(param));
      });
      worker.terminate();
      return new Response(result.toString(), {
        headers: { "Content-Type": "text/plain" },
      });
    }

    case endpoints.FIBONACCI_PARALLEL: {
      if (isNaN(Number(param))) {
        return new Response("400 Bad Request\n", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      const workers = Array.from(
        { length: 4 },
        () =>
          new Worker(new URL("./fibonacci.worker.ts", import.meta.url).href, {
            type: "module",
          })
      );

      const values = await Promise.all(
        workers.map(
          (worker, index) =>
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

    case endpoints.VIDEO_SERVING: {
      const filePath = new URL("./resources/video.mp4", import.meta.url);
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

    case endpoints.MEMORY_INTENSIVE: {
      // Reduce array size for Kubernetes environment
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
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          }
        );
      }
    }

    case endpoints.JSON_PROCESSING: {
      const jsonMultiplier = Number(param) || 1;
      const numberOfElements = jsonMultiplier * 1000;

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
});
