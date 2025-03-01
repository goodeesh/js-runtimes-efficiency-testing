// fibonacci.worker.ts
import { parentPort } from "worker_threads";

function fibonacci(n: number): number {
  if (n <= 0) return 0;
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

parentPort?.on("message", (n: number) => {
  const result = fibonacci(n);
  parentPort?.postMessage(result);
});