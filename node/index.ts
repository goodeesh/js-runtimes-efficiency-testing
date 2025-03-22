import * as http from "node:http";
import * as path from "node:path";
import { Worker } from "node:worker_threads";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Database } from "./CRUD.class";

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
  
  // Health check endpoint
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  const firstParam = url.pathname.split('/')[1];
  const secondParam = url.pathname.split('/')[2];
  switch (firstParam) {
    case endpoints.JSON_SMALL: {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Hello World!" }));
      break;
    }
    case endpoints.FIBONACCI_BLOCKER: {
      // CPU-intensive task on the main thread (blocking)
      console.log("fibonacci endpoint called");
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
      // CPU-intensive task offloaded to a worker thread
      const worker = new Worker("./fibonacci.worker.js");
      console.log("fibonacci non-blocking endpoint called");
      if (isNaN(Number(secondParam))) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("400 Bad Request\n");
        return;
      }
      worker.on("message", resolve);
      worker.postMessage(secondParam);
      // deno-lint-ignore no-inner-declarations
      function resolve(result: number) {
        worker.terminate();
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(result.toString());
      }
      break;
    }
    case endpoints.FIBONACCI_PARALLEL: {
      // Using multiple worker threads for parallel computation
      console.log("fibonacci parallel endpoint called");
      if (isNaN(Number(secondParam))) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("400 Bad Request\n");
        return;
      }
      const worker1 = new Worker(`./fibonacci.worker.js`);
      const worker2 = new Worker(`./fibonacci.worker.js`);
      const worker3 = new Worker(`./fibonacci.worker.js`);
      const worker4 = new Worker(`./fibonacci.worker.js`);

      Promise.all([
        new Promise((resolve) => {
          worker1.on("message", resolve);
          worker1.postMessage(secondParam);
        }),
        new Promise((resolve) => {
          worker2.on("message", resolve);
          worker2.postMessage(Number(secondParam) - 1);
        }),
        new Promise((resolve) => {
          worker3.on("message", resolve);
          worker3.postMessage(Number(secondParam) - 2);
        }),
        new Promise((resolve) => {
          worker4.on("message", resolve);
          worker4.postMessage(Number(secondParam) - 3);
        }),
      ]).then((values) => {
        worker1.terminate();
        worker2.terminate();
        worker3.terminate();
        worker4.terminate();
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(JSON.stringify(values));
      });
      break;
    }
    case endpoints.VIDEO_SERVING: {
      // I/O-intensive task for serving video content
      console.log("video serving endpoint called");
      const __dirname = path.resolve();
      const filePath = path.join(__dirname, "../resources/video.mp4");
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
      // Memory-intensive endpoint
      console.log("memory intensive endpoint called");
      if (isNaN(Number(secondParam))) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("400 Bad Request\n");
        return;
      }
      // Use the query parameter as a multiplier for the workload.
      // For example, a multiplier of 1 creates an array with 10 million numbers.
      const multiplier = Number(secondParam);
      const numElements = multiplier * 10_000_000;
      console.log(`Allocating an array with ${numElements} elements`);

      try {
        // Allocate a large array and fill it with random numbers.
        const largeArray = new Array(numElements);
        for (let i = 0; i < numElements; i++) {
          largeArray[i] = Math.random();
        }
        // Perform a heavy operation: sorting the array.
        largeArray.sort((a, b) => a - b);
        // Further process: compute the sum of all elements.
        const total = largeArray.reduce((acc, val) => acc + val, 0);
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(`Memory intensive operation completed. Sum: ${total}`);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Error during memory-intensive operation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      break;
    }
    case endpoints.JSON_PROCESSING: {
      console.log("json-processing endpoint called");
      // Use the second URL parameter as a multiplier for workload size (default to 1)
      const jsonMultiplier = Number(secondParam) || 1;
      // For example, generate 100,000 objects per multiplier unit
      const numberOfElements = jsonMultiplier * 100000;
      console.log(`Generating an array with ${numberOfElements} elements`);

      // Generate a large array of objects
      const largeArray = [];
      for (let i = 0; i < numberOfElements; i++) {
        largeArray.push({ id: i, value: Math.random() });
      }

      // Serialize the array into a JSON string
      const jsonString = JSON.stringify(largeArray);

      // Parse the JSON string back into a JavaScript object
      const parsedData = JSON.parse(jsonString);

      // Return the entire parsed JSON as the response
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(parsedData));
      break;
    }
    case endpoints.INSERT_USER: {
      console.log("insertUser endpoint called");
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
        database.insertUser(username, password, email, name, surname, age).then(() => {
          console.log("User inserted successfully");
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
      console.log("deleteUser endpoint called");
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
        database.deleteUser(username).then(() => {
          console.log("User deleted successfully");
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
      console.log("getUser endpoint called");
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
        database.getUser(username).then((user) => {
          console.log("User retrieved successfully");
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
      console.log("updateUser endpoint called");
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
        database.updateUser(username, password).then(() => {
          console.log("User updated successfully");
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
        .map(endpoint => `- /${endpoint}`)
        .join("\n");
      
      res.end(`404 Not Found\n\nThe available endpoints are:\n${endpointsList}\n- /health (server health check)`);
      break;
    }
  }
});

server.listen(3000);
