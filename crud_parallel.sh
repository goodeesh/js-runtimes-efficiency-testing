set -e

# Check if GNU Parallel is installed
if ! command -v parallel &> /dev/null; then
    echo "GNU Parallel is required. Please install it with: sudo dnf install parallel"
    exit 1
fi

# Get runtime selection from user
echo "Select a runtime to benchmark:"
echo "1) Node.js"
echo "2) Bun"
echo "3) Deno"
read -p "Enter your choice (1-3): " runtime_choice

case "$runtime_choice" in
    1) RUNTIME="node" ;;
    2) RUNTIME="bun" ;;
    3) RUNTIME="deno" ;;
    *) echo "Invalid choice. Please select 1, 2, or 3."; exit 1 ;;
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
export BASE_URL

# Configuration
NUM_USERS=2000
CONCURRENCY=100
CONNECT_TIMEOUT=5
export CONNECT_TIMEOUT

# Setup directories
RESULTS_DIR="benchmark_results/${RUNTIME}_crud"
mkdir -p "$RESULTS_DIR"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Initialize results file
CSV_FILE="$RESULTS_DIR/summary.csv"
if [ ! -f "$CSV_FILE" ]; then
  echo "Timestamp,Runtime,Operation,SuccessCount,TotalCount,Duration,OpsPerSec" > "$CSV_FILE"
fi

echo "Testing against $BASE_URL with GNU Parallel (concurrency: $CONCURRENCY)"

# Function to prepare test data for all CRUD operations
prepare_test_data() {
  echo -e "\n======= Preparing data for CRUD operations ======="
  
  # Create directories for each operation
  mkdir -p "$TEMP_DIR/create" "$TEMP_DIR/get" "$TEMP_DIR/update" "$TEMP_DIR/delete"
  
  # Generate unique users
  for i in $(seq 1 $NUM_USERS); do
    timestamp=$(date +%s%N)
    random=$((RANDOM + RANDOM))
    username="testuser_${timestamp}_${random}_$i"
    
    # Create payload - store the username in a variable to use for all operations
    create_data="{\"username\":\"$username\",\"password\":\"password123\",\"email\":\"$username@example.com\",\"name\":\"Test\",\"surname\":\"User\",\"age\":30}"
    
    # Save user data for CREATE
    echo "$create_data" > "$TEMP_DIR/create/$i.json"
    
    # Prepare GET data
    echo "{\"username\":\"$username\"}" > "$TEMP_DIR/get/$i.json"
    
    # Prepare UPDATE data
    echo "{\"username\":\"$username\",\"name\":\"Updated$i\",\"password\":\"updated123\"}" > "$TEMP_DIR/update/$i.json"
    
    # Prepare DELETE data
    echo "{\"username\":\"$username\"}" > "$TEMP_DIR/delete/$i.json"
  done
  
  echo "Test data prepared for $NUM_USERS users."
}
# Function to run benchmark for any CRUD operation
run_benchmark() {
  export operation=$1      # operation type (create, get, update, delete)
  local dir="$TEMP_DIR/$operation" # directory with test files
  local display_name=$(echo "$operation" | tr '[:lower:]' '[:upper:]')
  
  if [ "$operation" = "get" ]; then
    display_name="READ"   # Adjust display name for "get" operation
  fi
  
  echo -e "\n======= Running $display_name operations with concurrency $CONCURRENCY ======="
  
  local results_file="$TEMP_DIR/${operation}_results.csv"
  local start_time=$(date +%s.%N)
  
  # Create a temporary operation function for GNU Parallel that works for all operations
  execute_operation() {
    local file=$1
    local start=$(date +%s.%N)
    
    # Get the endpoint name based on operation
    local endpoint="${operation}User"
    
    # Make request 
    local response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" \
      --connect-timeout $CONNECT_TIMEOUT -d @"$file" "$BASE_URL/$endpoint")
    local status=$(echo "$response" | tail -n1)
    local end=$(date +%s.%N)
    local dur=$(echo "$end - $start" | bc)
    
    # Return operation identifier and status (for all operations)
    echo "$operation,$status,$dur"
  }
  
  # Export the function for GNU Parallel
  export -f execute_operation
  
  # Run the operation using GNU Parallel
  find "$dir" -name "*.json" | \
    parallel -j $CONCURRENCY "execute_operation {}" > "$results_file"
  
  # Clean up the temporary function
  unset -f execute_operation
  
  local end_time=$(date +%s.%N)
  local duration=$(echo "$end_time - $start_time" | bc)
  
  # Extract success metrics (consistent pattern for all operations)
  local successful_ops=$(grep "$operation,200" "$results_file" | wc -l)
  local ops_rate=$(echo "scale=2; $successful_ops / $duration" | bc)
  
  echo "Completed $successful_ops $display_name operations in $duration seconds ($ops_rate ops/sec)"
  
  # Save to results CSV
  echo "$TIMESTAMP,$RUNTIME,$display_name,$successful_ops,$NUM_USERS,$duration,$ops_rate" >> "$CSV_FILE"
  
  # Store results in global variables for summary
  eval "${operation}_success=$successful_ops"
  eval "${operation}_duration=$duration"
  eval "${operation}_rate=$ops_rate"
}

# Generate summary report
generate_summary() {
  echo -e "\n======= Performance Summary ($RUNTIME) ======="
  echo "Operation  | Success Rate | Operations/sec"
  echo "-----------|--------------|--------------"
  echo "CREATE     | $create_success/$NUM_USERS | $create_rate"
  echo "READ       | $get_success/$NUM_USERS | $get_rate"
  echo "UPDATE     | $update_success/$NUM_USERS | $update_rate"
  echo "DELETE     | $delete_success/$NUM_USERS | $delete_rate"
  
  # Create detailed report file
  local RESULT_FILE="$RESULTS_DIR/parallel_crud_${TIMESTAMP}.txt"
  
  {
    echo "CRUD Performance Test Results - $RUNTIME - $(date)"
    echo "Server: $BASE_URL"
    echo "Users: $NUM_USERS"
    echo "Concurrency: $CONCURRENCY"
    echo ""
    echo "Operation  | Success Rate | Operations/sec"
    echo "-----------|--------------|--------------"
    echo "CREATE     | $create_success/$NUM_USERS | $create_rate"
    echo "READ       | $get_success/$NUM_USERS | $get_rate"
    echo "UPDATE     | $update_success/$NUM_USERS | $update_rate"
    echo "DELETE     | $delete_success/$NUM_USERS | $delete_rate"
  } > "$RESULT_FILE"
  
  echo -e "\nResults saved to $RESULT_FILE"
  echo "CSV summary updated at $CSV_FILE"
}

# ---- MAIN EXECUTION ----
echo "Starting CRUD benchmarks for $RUNTIME runtime..."

# Step 1: Prepare all test data
prepare_test_data

# Step 2: Run all benchmarks
run_benchmark "create"
run_benchmark "get"
run_benchmark "update"
run_benchmark "delete"

# Step 3: Generate summary
generate_summary

echo "CRUD testing complete for $RUNTIME!"