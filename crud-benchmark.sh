#!/usr/bin/env bash
# CRUD Benchmark orchestration script - Sequential batch operations
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

# Test parameters
NUM_USERS=500
CONCURRENCY_LEVELS=(100)
REQUEST_TIMEOUT=30s

# Results directory - specific to the selected runtime
RESULTS_DIR="crud_benchmark_results/${RUNTIME}"
mkdir -p "$RESULTS_DIR"

echo "Starting CRUD benchmarking for $RUNTIME..."
echo "Operation,Runtime,Concurrency,RequestsPerSecond,MeanLatency,TotalRequests,ErrorRate" > "$RESULTS_DIR/crud_summary.csv"

# Function to generate user data files
generate_user_data() {
  echo "Generating user data files..."
  mkdir -p "$RESULTS_DIR/data"
  
  # Generate CREATE data
  echo "[" > "$RESULTS_DIR/data/create_users.json"
  for i in $(seq 1 $NUM_USERS); do
    if [ $i -gt 1 ]; then
      echo "," >> "$RESULTS_DIR/data/create_users.json"
    fi
    echo "{\"username\":\"testuser$i\",\"password\":\"password123\",\"email\":\"testuser$i@example.com\",\"name\":\"Test\",\"surname\":\"User\",\"age\":30}" >> "$RESULTS_DIR/data/create_users.json"
  done
  echo "]" >> "$RESULTS_DIR/data/create_users.json"
  
  # Generate GET data
  echo "[" > "$RESULTS_DIR/data/get_users.json"
  for i in $(seq 1 $NUM_USERS); do
    if [ $i -gt 1 ]; then
      echo "," >> "$RESULTS_DIR/data/get_users.json"
    fi
    echo "{\"username\":\"testuser$i\"}" >> "$RESULTS_DIR/data/get_users.json"
  done
  echo "]" >> "$RESULTS_DIR/data/get_users.json"
  
  # Generate UPDATE data
  echo "[" > "$RESULTS_DIR/data/update_users.json"
  for i in $(seq 1 $NUM_USERS); do
    if [ $i -gt 1 ]; then
      echo "," >> "$RESULTS_DIR/data/update_users.json"
    fi
    echo "{\"username\":\"testuser$i\",\"password\":\"newpassword123\",\"email\":\"user$i@example.com\",\"name\":\"Updated\",\"surname\":\"User\",\"age\":31}" >> "$RESULTS_DIR/data/update_users.json"
  done
  echo "]" >> "$RESULTS_DIR/data/update_users.json"
  
  # Generate DELETE data
  echo "[" > "$RESULTS_DIR/data/delete_users.json"
  for i in $(seq 1 $NUM_USERS); do
    if [ $i -gt 1 ]; then
      echo "," >> "$RESULTS_DIR/data/delete_users.json"
    fi
    echo "{\"username\":\"testuser$i\"}" >> "$RESULTS_DIR/data/delete_users.json"
  done
  echo "]" >> "$RESULTS_DIR/data/delete_users.json"
}

# Function to benchmark with bombardier
benchmark_operation() {
  local operation=$1
  local payload=$2
  local concurrency=$3
  
  local url="http://localhost:$PORT/$operation"
  local output_file="$RESULTS_DIR/${operation}_c${concurrency}.txt"
  
  echo "Benchmarking $operation for $RUNTIME (concurrency: $concurrency)..."
  
  # Run bombardier with fixed number of requests
  echo "$payload" > /tmp/benchmark_payload.json
  bombardier -c $concurrency -n $NUM_USERS -m POST -t $REQUEST_TIMEOUT \
    -H "Content-Type: application/json" \
    -f /tmp/benchmark_payload.json \
    "$url" > "$output_file"
  
  # Extract metrics
  local rps=$(grep "Reqs/sec" "$output_file" | awk '{print $2}')
  local latency=$(grep "Latency" "$output_file" | awk '{print $2}')
  local total_reqs=$(grep "Done!" -A 1 "$output_file" | grep -oE '[0-9]+ / [0-9]+' | cut -d'/' -f2 | tr -d ' ')
  local error_rate=$(grep "HTTP codes:" -A 1 "$output_file" | grep -oE '5xx - [0-9]+' | cut -d' ' -f3)
  if [ -z "$error_rate" ]; then error_rate="0"; fi
  
  echo "$operation,$RUNTIME,$concurrency,$rps,$latency,$total_reqs,$error_rate" >> "$RESULTS_DIR/crud_summary.csv"
}

# Generate all test data files
generate_user_data

echo "==============================================="
echo "Starting CRUD benchmarks for $RUNTIME on port $PORT"
echo "==============================================="

for concurrency in "${CONCURRENCY_LEVELS[@]}"; do
  echo "Testing concurrency level: $concurrency"
  
  # PHASE 1: CREATE - First create all users sequentially to prepare the database
  echo "Phase 1: CREATE - Inserting $NUM_USERS users..."
  
  # First, do a single-request creation for each user to ensure they exist
  for i in $(seq 1 $NUM_USERS); do
    username="testuser$i"
    email="${username}@example.com"
    payload="{\"username\":\"$username\",\"password\":\"password123\",\"email\":\"$email\",\"name\":\"Test\",\"surname\":\"User\",\"age\":30}"
    
    curl -s -X POST -H "Content-Type: application/json" \
      -d "$payload" "http://localhost:$PORT/insertUser" > /dev/null
    
    # Print progress every 100 users
    if [ $((i % 100)) -eq 0 ]; then
      echo "Created $i/$NUM_USERS users..."
    fi
  done
  
  echo "All users created successfully"
  sleep 2
  
  # PHASE 2: READ - Benchmark reading users
  echo "Phase 2: READ - Benchmarking getUser..."
  for i in $(seq 1 $NUM_USERS | sort -R | head -n 100); do  # Test with 100 random users
    username="testuser$i"
    payload="{\"username\":\"$username\"}"
    benchmark_operation "getUser" "$payload" "$concurrency"
  done
  
  # PHASE 3: UPDATE - Benchmark updating users
  echo "Phase 3: UPDATE - Benchmarking updateUser..."
  for i in $(seq 1 $NUM_USERS | sort -R | head -n 100); do  # Test with 100 random users
    username="testuser$i"
    payload="{\"username\":\"$username\",\"password\":\"newpassword123\",\"email\":\"user$i@example.com\",\"name\":\"Updated\",\"surname\":\"User\",\"age\":31}"
    benchmark_operation "updateUser" "$payload" "$concurrency"
  done
  
  # PHASE 4: DELETE - Benchmark deleting users
  echo "Phase 4: DELETE - Benchmarking deleteUser..."
  for i in $(seq 1 $NUM_USERS); do
    username="testuser$i"
    payload="{\"username\":\"$username\"}"
    
    curl -s -X POST -H "Content-Type: application/json" \
      -d "$payload" "http://localhost:$PORT/deleteUser" > /dev/null
    
    # Print progress every 100 users
    if [ $((i % 100)) -eq 0 ]; then
      echo "Deleted $i/$NUM_USERS users..."
    fi
  done
  
  echo "All users deleted successfully"
done

echo "CRUD benchmarking complete for $RUNTIME! Results saved to $RESULTS_DIR"
echo "Summary report available at: $RESULTS_DIR/crud_summary.csv"

# Clean up
rm -f /tmp/benchmark_payload.json