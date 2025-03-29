#!/usr/bin/env bash
# Benchmark orchestration script
set -e

# Check if bombardier is installed
if ! command -v bombardier &> /dev/null; then
    echo "Bombardier is not installed. Please install it first."
    echo "You can install it using: brew install bombardier"
    echo "Or download from: https://github.com/codesenberg/bombardier/releases"
    exit 1
fi

# Get runtime selection from user
echo "Select a runtime to benchmark:"
echo "1) Node.js"
echo "2) Bun"
echo "3) Deno"
read -p "Enter your choice (1-3): " runtime_choice

case "$runtime_choice" in
    1)
        RUNTIME="node"
        PORT="3000"
        ;;
    2)
        RUNTIME="bun"
        PORT="5000"
        ;;
    3)
        RUNTIME="deno"
        PORT="8000"
        ;;
    *)
        echo "Invalid choice. Please select 1, 2, or 3."
        exit 1
        ;;
esac

echo "Running benchmarks for $RUNTIME on port $PORT..."

# Results directory
RESULTS_DIR="benchmark_results/${RUNTIME}"
mkdir -p "$RESULTS_DIR"

# Test parameters
CONCURRENCY_LEVELS=(1000)
REQUESTS=1000000

# Utility function for running benchmarks
run_benchmark() {
  local endpoint=$1
  local concurrency=$2

  echo "Testing $RUNTIME - $endpoint (c=$concurrency)"

  local sanitized_endpoint=${endpoint//\//_} # Replace '/' with '_'
  local url="http://localhost:$PORT/$endpoint"
  local output_file="$RESULTS_DIR/${sanitized_endpoint}_c${concurrency}.txt"

  bombardier -c $concurrency -n $REQUESTS "$url" > "$output_file"
  
  local rps=$(grep "Reqs/sec" "$output_file" | awk '{print $2}')
  local mean_latency=$(grep "Latency" "$output_file" | awk '{print $2}')

  echo "$RUNTIME,$endpoint,$concurrency,$rps,$mean_latency" >> "$RESULTS_DIR/summary.csv"
}

# Initialize results file
echo "Runtime,Endpoint,Concurrency,RequestsPerSecond,MeanLatency" > "$RESULTS_DIR/summary.csv"

# Function to run benchmarks for a specific endpoint
benchmark_endpoint() {
  local endpoint=$1

  for concurrency in "${CONCURRENCY_LEVELS[@]}"; do
    run_benchmark "$endpoint" "$concurrency"
  done
}

echo "Starting benchmarks for $RUNTIME runtime..."
benchmark_endpoint "json-small"
benchmark_endpoint "fibonacci-blocker/20"
benchmark_endpoint "fibonacci-non-blocking/20"
benchmark_endpoint "fibonacci-parallel/20"
benchmark_endpoint "video-serving"
benchmark_endpoint "memory-intensive/1"
benchmark_endpoint "json-processing"

echo "Benchmarking complete for $RUNTIME! Results saved to $RESULTS_DIR"