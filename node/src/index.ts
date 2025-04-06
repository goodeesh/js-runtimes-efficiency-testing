import * as http from "node:http";
import * as path from "node:path";
import { Worker } from "node:worker_threads";
import * as fs from "node:fs";
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

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("400 Bad Request\n");
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }

  const firstParam = url.pathname.split("/")[1];
  const secondParam = url.pathname.split("/")[2];

  switch (firstParam) {
    case endpoints.JSON_SMALL: {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Hello World!" }));
      break;
    }
    case endpoints.FIBONACCI_BLOCKER: {
      if (isNaN(Number(secondParam))) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("400 Bad Request\n");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(fibonacci(Number(secondParam)).toString());
      break;
    }
    case endpoints.FIBONACCI_NON_BLOCKING: {
      const worker = new Worker(path.join(__dirname, "fibonacci.worker.js"));
      if (isNaN(Number(secondParam))) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("400 Bad Request\n");
        return;
      }
      worker.on("message", resolve);
      worker.postMessage(secondParam);
      function resolve(result: number) {
        worker.terminate();
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(result.toString());
      }
      break;
    }

    case endpoints.VIDEO_SERVING: {
      // I/O-intensive task for serving video content
      const __dirname = path.resolve();
      const filePath = path.join(__dirname, "./resources/video.mp4");
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": "video/mp4",
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          "Content-Length": fileSize,
          "Content-Type": "video/mp4",
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
      }
      break;
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

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(`Memory intensive operation completed. Sum: ${total}`);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(
          `Error during memory-intensive operation: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
      break;
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

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(parsedData));
      break;
    }

    case endpoints.CREATE_USER: {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("405 Method Not Allowed\n");
        return;
      }
      if (!req.headers["content-type"]) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("400 Bad Request\n");
        return;
      }
      if (req.headers["content-type"] !== "application/json") {
        res.writeHead(415, { "Content-Type": "text/plain" });
        res.end("415 Unsupported Media Type\n");
        return;
      }
      const body: Uint8Array[] = [];
      req.on("data", (chunk) => {
        body.push(chunk);
      });
      req.on("end", () => {
        const parsedBody = JSON.parse(Buffer.concat(body).toString());
        const { username, password, email, name, surname, age } = parsedBody;
        if (!username || !password || !email || !name || !surname || !age) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("400 Bad Request\n");
          return;
        }
        database
          .createUser(username, password, email, name, surname, age)
          .then(() => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("User inserted successfully\n");
          })
          .catch((error) => {
            console.error("Error inserting user:", error);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("500 Internal Server Error\n");
            return;
          });
      });
      break;
    }
    case endpoints.DELETE_USER: {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("405 Method Not Allowed\n");
        return;
      }
      if (!req.headers["content-type"]) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("400 Bad Request\n");
        return;
      }
      if (req.headers["content-type"] !== "application/json") {
        res.writeHead(415, { "Content-Type": "text/plain" });
        res.end("415 Unsupported Media Type\n");
        return;
      }
      const body: Uint8Array[] = [];
      req.on("data", (chunk) => {
        body.push(chunk);
      });
      req.on("end", () => {
        const parsedBody = JSON.parse(Buffer.concat(body).toString());
        const { username } = parsedBody;
        if (!username) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("400 Bad Request\n");
          return;
        }
        database
          .deleteUser(username)
          .then(() => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("User deleted successfully\n");
          })
          .catch((error) => {
            console.error("Error deleting user:", error);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("500 Internal Server Error\n");
            return;
          });
      });
      break;
    }
    case endpoints.GET_USER: {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("405 Method Not Allowed\n");
        return;
      }
      if (!req.headers["content-type"]) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("400 Bad Request\n");
        return;
      }
      if (req.headers["content-type"] !== "application/json") {
        res.writeHead(415, { "Content-Type": "text/plain" });
        res.end("415 Unsupported Media Type\n");
        return;
      }
      const body: Uint8Array[] = [];
      req.on("data", (chunk) => {
        body.push(chunk);
      });
      req.on("end", () => {
        const parsedBody = JSON.parse(Buffer.concat(body).toString());
        const { username } = parsedBody;
        if (!username) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("400 Bad Request\n");
          return;
        }
        database
          .getUser(username)
          .then((user) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(user));
          })
          .catch((error) => {
            console.error("Error retrieving user:", error);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("500 Internal Server Error\n");
            return;
          });
      });
      break;
    }
    case endpoints.UPDATE_USER: {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("405 Method Not Allowed\n");
        return;
      }
      if (!req.headers["content-type"]) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("400 Bad Request\n");
        return;
      }
      if (req.headers["content-type"] !== "application/json") {
        res.writeHead(415, { "Content-Type": "text/plain" });
        res.end("415 Unsupported Media Type\n");
        return;
      }
      const body: Uint8Array[] = [];
      req.on("data", (chunk) => {
        body.push(chunk);
      });
      req.on("end", () => {
        const parsedBody = JSON.parse(Buffer.concat(body).toString());
        const { username, password } = parsedBody;
        if (!username || !password) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("400 Bad Request\n");
          return;
        }
        database
          .updateUser(username, password)
          .then(() => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("User updated successfully\n");
          })
          .catch((error) => {
            console.error("Error updating user:", error);
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("500 Internal Server Error\n");
            return;
          });
      });
      break;
    }

    default: {
      res.writeHead(404, { "Content-Type": "text/plain" });
      const endpointsList = Object.values(endpoints)
        .map((endpoint) => `- /${endpoint}`)
        .join("\n");

      res.end(
        `404 Not Found\n\nThe available endpoints are:\n${endpointsList}\n- /health (server health check)`
      );
      break;
    }
  }
});

server.listen(3000);
