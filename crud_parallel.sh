#!/bin/bash
# filepath: /home/adrian/Documents/GitHub/js-runtimes-efficiency-testing/crud_parallel.sh

# Check if GNU Parallel is installed
if ! command -v parallel &> /dev/null; then
    echo "GNU Parallel is required. Please install it with: sudo apt-get install parallel"
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

echo "Selected runtime: $RUNTIME"

# Get Minikube IP and port for the selected runtime
MINIKUBE_IP=$(minikube ip)
SERVICE="${RUNTIME}-app-service"
NODE_PORT=$(kubectl get svc $SERVICE -o jsonpath='{.spec.ports[0].nodePort}')
if [ $? -ne 0 ] || [ -z "$NODE_PORT" ]; then
    echo "Error: Failed to get NodePort for $SERVICE. Is the service deployed?"
    exit 1
fi

BASE_URL="http://$MINIKUBE_IP:$NODE_PORT"

# Configuration
NUM_USERS=2000
CONCURRENCY=100  # Number of parallel operations
RETRY_DELAY=1   # Seconds to wait between retries
CONNECT_TIMEOUT=5  # Seconds to wait for connection

echo "Testing against $BASE_URL with GNU Parallel (concurrency: $CONCURRENCY)"

# Create a temp directory for our test files
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Prepare all the creation request files upfront
echo -e "\n======= Preparing data for $NUM_USERS test users ======="
mkdir -p "$TEMP_DIR/create"

for i in $(seq 1 $NUM_USERS); do
  # Use timestamp and random to ensure uniqueness
  timestamp=$(date +%s%N)
  random=$((RANDOM + RANDOM))
  username="testuser_${timestamp}_${random}_$i"
  
  # Create unique user payload and save the username for reference
  echo "{\"username\":\"$username\",\"password\":\"password123\",\"email\":\"$username@example.com\",\"name\":\"Test\",\"surname\":\"User\",\"age\":30}" > "$TEMP_DIR/create/$i.json"
  echo "$username" > "$TEMP_DIR/create/$i.username"
done

# Function to create a user with curl and measure time
create_user() {
  local file=$1
  local start_time=$(date +%s.%N)
  
  # Get the username from the companion file for reporting
  local username_file="${file%.json}.username"
  local username=$(cat "$username_file")
  
  # Make the request with timeout to prevent hanging
  response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" \
    --connect-timeout $CONNECT_TIMEOUT -d @"$file" "$BASE_URL/insertUser")
  status_code=$(echo "$response" | tail -n1)
  end_time=$(date +%s.%N)
  duration=$(echo "$end_time - $start_time" | bc)
  
  echo "$username,$status_code,$duration"
}
export -f create_user
export BASE_URL
export CONNECT_TIMEOUT

# Step 1: Create unique users in parallel
echo -e "\n======= Creating $NUM_USERS test users in parallel ======="
start_time=$(date +%s.%N)

# Run parallel and output to CSV file
find "$TEMP_DIR/create" -name "*.json" | \
  parallel -j $CONCURRENCY "create_user {}" > "$TEMP_DIR/create_results.csv"

end_time=$(date +%s.%N)
create_duration=$(echo "$end_time - $start_time" | bc)
successful_creates=$(grep ",200" "$TEMP_DIR/create_results.csv" | wc -l)
create_rate=$(echo "$successful_creates / $create_duration" | bc)

echo "Created $successful_creates users in $create_duration seconds ($create_rate users/sec)"

# Count successful users
USER_COUNT=$successful_creates
if [ "$USER_COUNT" -eq 0 ]; then
  echo "No users were created successfully. Exiting."
  exit 1
fi

# Prepare for parallel operations
echo -e "\nPreparing for parallel operations..."
mkdir -p "$TEMP_DIR/get" "$TEMP_DIR/update" "$TEMP_DIR/delete"

# Create test files for each operation
counter=0
while read username; do
  # Files for GET
  echo "{\"username\":\"$username\"}" > "$TEMP_DIR/get/$counter.json"
  
  # Files for UPDATE
  echo "{\"username\":\"$username\",\"name\":\"Updated$counter\",\"password\":\"updated123\"}" > "$TEMP_DIR/update/$counter.json"
  
  # Files for DELETE
  echo "{\"username\":\"$username\"}" > "$TEMP_DIR/delete/$counter.json"
  
  ((counter++))
done < <(grep ",200" "$TEMP_DIR/create_results.csv" | cut -d, -f1)

# Function to perform operation with curl and measure time
perform_operation() {
  local operation=$1
  local file=$2
  local start_time=$(date +%s.%N)
  
  response=$(curl -s -w "\n%{http_code}" --connect-timeout $CONNECT_TIMEOUT -X POST -H "Content-Type: application/json" \
    -d @"$file" "$BASE_URL/${operation}User")
  
  status_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n -1)
  end_time=$(date +%s.%N)
  duration=$(echo "$end_time - $start_time" | bc)
  
  echo "$operation,$status_code,$duration"
}
export -f perform_operation

# Step 2: Perform GET operations in parallel
echo -e "\n======= Running GET operations with concurrency $CONCURRENCY ======="
start_time=$(date +%s.%N)

# Run parallel and output to CSV file
find "$TEMP_DIR/get" -name "*.json" | \
  parallel -j $CONCURRENCY "perform_operation get {}" > "$TEMP_DIR/get_results.csv"

end_time=$(date +%s.%N)
get_duration=$(echo "$end_time - $start_time" | bc)
successful_gets=$(grep "get,200" "$TEMP_DIR/get_results.csv" | wc -l)
get_rate=$(echo "$successful_gets / $get_duration" | bc)

echo "Completed $successful_gets GET operations in $get_duration seconds ($get_rate ops/sec)"

# Step 3: Perform UPDATE operations in parallel
echo -e "\n======= Running UPDATE operations with concurrency $CONCURRENCY ======="
start_time=$(date +%s.%N)

find "$TEMP_DIR/update" -name "*.json" | \
  parallel -j $CONCURRENCY "perform_operation update {}" > "$TEMP_DIR/update_results.csv"

end_time=$(date +%s.%N)
update_duration=$(echo "$end_time - $start_time" | bc)
successful_updates=$(grep "update,200" "$TEMP_DIR/update_results.csv" | wc -l)
update_rate=$(echo "$successful_updates / $update_duration" | bc)

echo "Completed $successful_updates UPDATE operations in $update_duration seconds ($update_rate ops/sec)"

# Step 4: Perform DELETE operations in parallel
echo -e "\n======= Running DELETE operations with concurrency $CONCURRENCY ======="
start_time=$(date +%s.%N)

find "$TEMP_DIR/delete" -name "*.json" | \
  parallel -j $CONCURRENCY "perform_operation delete {}" > "$TEMP_DIR/delete_results.csv"

end_time=$(date +%s.%N)
delete_duration=$(echo "$end_time - $start_time" | bc)
successful_deletes=$(grep "delete,200" "$TEMP_DIR/delete_results.csv" | wc -l)
delete_rate=$(echo "$successful_deletes / $delete_duration" | bc)

echo "Completed $successful_deletes DELETE operations in $delete_duration seconds ($delete_rate ops/sec)"

# Create a summary report
echo -e "\n======= Performance Summary ($RUNTIME) ======="
echo "Operation  | Success Rate | Operations/sec"
echo "-----------|--------------|--------------"
echo "CREATE     | $successful_creates/$NUM_USERS | $create_rate"
echo "READ       | $successful_gets/$successful_creates | $get_rate"
echo "UPDATE     | $successful_updates/$successful_creates | $update_rate"
echo "DELETE     | $successful_deletes/$successful_creates | $delete_rate"

# Save results to benchmark_results directory with runtime info
mkdir -p benchmark_results/${RUNTIME}_crud
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULT_FILE="benchmark_results/${RUNTIME}_crud/parallel_crud_${TIMESTAMP}.txt"

{
  echo "CRUD Performance Test Results - $RUNTIME - $(date)"
  echo "Server: $BASE_URL"
  echo "Users: $NUM_USERS"
  echo "Concurrency: $CONCURRENCY"
  echo ""
  echo "Operation  | Success Rate | Operations/sec"
  echo "-----------|--------------|--------------"
  echo "CREATE     | $successful_creates/$NUM_USERS | $create_rate"
  echo "READ       | $successful_gets/$successful_creates | $get_rate"
  echo "UPDATE     | $successful_updates/$successful_creates | $update_rate"
  echo "DELETE     | $successful_deletes/$successful_creates | $delete_rate"
} > "$RESULT_FILE"

# Save a runtime-specific CSV summary
CSV_FILE="benchmark_results/${RUNTIME}_crud/summary.csv"

# Create CSV header if it doesn't exist
if [ ! -f "$CSV_FILE" ]; then
  echo "Timestamp,Runtime,Operation,SuccessCount,TotalCount,Duration,OpsPerSec" > "$CSV_FILE"
fi

# Append results to CSV
echo "$TIMESTAMP,$RUNTIME,CREATE,$successful_creates,$NUM_USERS,$create_duration,$create_rate" >> "$CSV_FILE"
echo "$TIMESTAMP,$RUNTIME,READ,$successful_gets,$successful_creates,$get_duration,$get_rate" >> "$CSV_FILE"
echo "$TIMESTAMP,$RUNTIME,UPDATE,$successful_updates,$successful_creates,$update_duration,$update_rate" >> "$CSV_FILE"
echo "$TIMESTAMP,$RUNTIME,DELETE,$successful_deletes,$successful_creates,$delete_duration,$delete_rate" >> "$CSV_FILE"

echo -e "\nResults saved to $RESULT_FILE"
echo "CSV summary updated at $CSV_FILE"
echo "Testing complete for $RUNTIME!"