/// <reference lib="deno.worker" />

function fibonacci(n: number): number {
    if (n <= 0) return 0;
    if (n <= 1) return 1;
    if (n <= 2) return 2;
    return fibonacci(n - 1) + fibonacci(n - 2);
  }
  
  self.onmessage = (e) => {
    const result = fibonacci(Number(e.data));
    self.postMessage(result);
  };