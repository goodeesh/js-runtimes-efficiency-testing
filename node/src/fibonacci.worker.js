const { parentPort } = require('worker_threads');

function fibonacci(n) {
    if (n <= 0) return 0;
    if (n <= 1) return 1;
    if (n <= 2) return 2;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

if (parentPort) {
    parentPort.on('message', (n) => {
        const result = fibonacci(parseInt(String(n)));
        parentPort.postMessage(result);
    });
}