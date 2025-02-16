import * as http from 'node:http'
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function fibonacci(n) {
    if (n <= 0) return 0
    if (n <= 1) return 1
    if (n <= 2) return 2
    return fibonacci(n - 1) + fibonacci(n - 2)
}

const server = http.createServer((req, res) => {
    const firstQuery = req.url.split('/')[1]
    const secondQuery = req.url.split('/')[2]
    switch (firstQuery) {
        case "fibonacci-blocker":
            // CPU-intensive task on the main thread (blocking)
            console.log("fibonacci endpoint called")
            if (isNaN(secondQuery)) {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("400 Bad Request\n");
                return;
            }
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end(fibonacci(Number(secondQuery)).toString());
            break;
        case "fibonacci-non-blocking":
            // CPU-intensive task offloaded to a worker thread
            const worker = new Worker("./fibonacci.worker.js");
            console.log("fibonacci non-blocking endpoint called")
            if (isNaN(secondQuery)) {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("400 Bad Request\n");
                return;
            }
            worker.on('message', resolve);
            worker.postMessage(secondQuery);
            function resolve(result) {
                worker.terminate();
                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end(result.toString());
            }
            break;
        case "fibonacci-parallel":
            // Using multiple worker threads for parallel computation
            console.log("fibonacci parallel endpoint called")
            if (isNaN(secondQuery)) {
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
                    worker1.on('message', resolve);
                    worker1.postMessage(secondQuery);
                }),
                new Promise((resolve) => {
                    worker2.on('message', resolve);
                    worker2.postMessage(secondQuery - 1);
                }),
                new Promise((resolve) => {
                    worker3.on('message', resolve);
                    worker3.postMessage(secondQuery - 2);
                }),
                new Promise((resolve) => {
                    worker4.on('message', resolve);
                    worker4.postMessage(secondQuery - 3);
                })
            ]).then((values) => {
                worker1.terminate();
                worker2.terminate();
                worker3.terminate();
                worker4.terminate();
                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end(JSON.stringify(values));
            });
            break;
        case "video-serving":
            // I/O-intensive task for serving video content
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            console.log("video serving endpoint called")
            const filePath = path.join(__dirname, '../resources/video.mp4');
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;
            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(filePath, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp4',
                };
                res.writeHead(206, head);
                file.pipe(res);
            } else {
                const head = {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4',
                };
                res.writeHead(200, head);
                fs.createReadStream(filePath).pipe(res);
            }
            break;
        case "memory-intensive":
            // Memory-intensive endpoint
            console.log("memory intensive endpoint called")
            if (isNaN(secondQuery)) {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("400 Bad Request\n");
                return;
            }
            // Use the query parameter as a multiplier for the workload.
            // For example, a multiplier of 1 creates an array with 10 million numbers.
            const multiplier = Number(secondQuery);
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
                res.end(`Error during memory-intensive operation: ${error.message}`);
            }
            break;
        default:
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('404 Not Found\n')
            break
    }
})

server.listen(3000)
