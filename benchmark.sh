#!/usr/bin/env bash
# Benchmark orchestration script
set -e

# Get runtime selection from user
echo "Select a runtime to benchmark:"
echo "1) Node.js"
echo "2) Bun"
echo "3) Deno"
read -p "Enter your choice (1-3): " runtime_choice

case "$runtime_choice" in
    1)
        RUNTIME="node"
        ;;
    2)
        RUNTIME="bun"
        ;;
    3)
        RUNTIME="deno"
        ;;
    *)
        echo "Invalid choice. Please select 1, 2, or 3."
        exit 1
        ;;
esac

# Get the Minikube IP and NodePort for direct access
MINIKUBE_IP=$(minikube ip)
if [ $? -ne 0 ]; then
    echo "Error: Failed to get Minikube IP. Is Minikube running? Try starting it with 'minikube start'."
    exit 1
fi

# Get the NodePort for the service
SERVICE="${RUNTIME}-app-service"
NODE_PORT=$(kubectl get svc $SERVICE -o jsonpath='{.spec.ports[0].nodePort}')
if [ $? -ne 0 ] || [ -z "$NODE_PORT" ]; then
    echo "Error: Failed to get NodePort for $SERVICE. Is the service deployed?"
    exit 1
fi

BASE_URL="http://$MINIKUBE_IP:$NODE_PORT"
echo "Running benchmarks for $RUNTIME using direct Kubernetes URL: $BASE_URL"

# Results directory
RESULTS_DIR="benchmark_results/${RUNTIME}_kubernetes"
mkdir -p "$RESULTS_DIR"

# Utility function for running benchmarks
run_benchmark() {
  local endpoint=$1
  local concurrency=$2
  local requests=$3

  echo "Testing $RUNTIME - $endpoint (c=$concurrency, n=$requests)"

  local endpointForOutputFile=${endpoint//\//_} # Replace '/' with '_'
  local url="${BASE_URL}/$endpoint"
  local output_file="$RESULTS_DIR/${endpointForOutputFile}_c${concurrency}.txt"

  ./bombardier -c $concurrency -n $requests "$url" > "$output_file"
  
  local rps=$(grep "Reqs/sec" "$output_file" | awk '{print $2}')
  local mean_latency=$(grep "Latency" "$output_file" | awk '{print $2}')
  local throughput=$(grep "Throughput:" "$output_file" | awk '{print $2}')
  
  # Extract HTTP status code counts
  local status_line=$(grep "HTTP codes:" -A 1 "$output_file" | tail -n 1)
  local success_count=$(echo "$status_line" | grep -oP "2xx - \K[0-9]+" || echo "0")
  local client_error_count=$(echo "$status_line" | grep -oP "4xx - \K[0-9]+" || echo "0")
  local server_error_count=$(echo "$status_line" | grep -oP "5xx - \K[0-9]+" || echo "0")
  local other_count=$(echo "$status_line" | grep -oP "others - \K[0-9]+" || echo "0")
  
  # Also extract connection errors and other failures
  local connection_errors=$(grep -A 1 "Errors:" "$output_file" | tail -n 1 | grep -oP "[0-9]+$" || echo "0")
  
  # Calculate error rate as percentage - include ALL errors
  local total_requests=$requests  # Use the requested number as total
  local error_rate=0
  if [ "$total_requests" -gt 0 ]; then
    local total_errors=$((client_error_count + server_error_count + other_count + connection_errors))
    error_rate=$(echo "scale=2; 100 * $total_errors / $total_requests" | bc)
  fi

  echo "$RUNTIME,$endpoint,$concurrency,$requests,$rps,$mean_latency,$throughput,$error_rate" >> "$RESULTS_DIR/summary.csv"
}

# Initialize results file
echo "Runtime,Endpoint,Concurrency,Requests,RequestsPerSecond,MeanLatency,Throughput,ErrorRate" > "$RESULTS_DIR/summary.csv"

echo "Starting benchmarks for $RUNTIME runtime..."

# json-small: 100,000 requests with concurrency of 10, 100, and 1000
echo "Testing json-small endpoint..."
run_benchmark "json-small" 10 100000
run_benchmark "json-small" 100 100000

# fibonacci-blocker/30: 10,000 requests with concurrency of 10 and 100
echo "Testing fibonacci-blocker endpoint..."
run_benchmark "fibonacci-blocker/30" 10 10000
run_benchmark "fibonacci-blocker/30" 100 10000



# video-serving: 10,000 requests with concurrency of 10 and 100
echo "Testing video-serving endpoint..."
run_benchmark "video-serving" 10 10000
run_benchmark "video-serving" 100 10000


# memory-intensive/1: 100,000 requests with concurrency of 10 and 100
run_benchmark "memory-intensive/1" 10 100000
run_benchmark "memory-intensive/1" 100 100000

# json-processing: 100,000 requests with concurrency of 10 and 100
echo "Testing json-processing endpoint..."
run_benchmark "json-processing" 10 10000
run_benchmark "json-processing" 100 10000

echo "Benchmarking complete for $RUNTIME! Results saved to $RESULTS_DIR"