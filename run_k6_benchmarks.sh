#!/bin/bash
set -e

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "k6 is required. Please install it (see https://k6.io/docs/getting-started/installation)"
    exit 1
fi

# Prompt user for runtime
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

# Get Minikube IP
MINIKUBE_IP=$(minikube ip)
if [ $? -ne 0 ]; then
    echo "Error: Failed to get Minikube IP. Is Minikube running? Try 'minikube start'."
    exit 1
fi

# Get NodePort for the selected runtime
SERVICE="${RUNTIME}-app-service"
NODE_PORT=$(kubectl get svc "$SERVICE" -o jsonpath='{.spec.ports[0].nodePort}')
if [ $? -ne 0 ] || [ -z "$NODE_PORT" ]; then
    echo "Error: Failed to get NodePort for $SERVICE. Is the service deployed?"
    exit 1
fi

BASE_URL="http://$MINIKUBE_IP:$NODE_PORT"
export BASE_URL

# Test configuration
NUM_USERS=50000      # total iterations
CONCURRENCY=1000     # number of virtual users (VUs)
export NUM_USERS
export CONCURRENCY

# Prepare directories
RESULTS_DIR="benchmark_results/${RUNTIME}_crud"
mkdir -p "$RESULTS_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CSV_FILE="$RESULTS_DIR/summary.csv"

# Initialize CSV if not present
if [ ! -f "$CSV_FILE" ]; then
  echo "Timestamp,Runtime,Operation,SuccessCount,TotalCount,Duration,OpsPerSec" > "$CSV_FILE"
fi

echo "Running k6 test against $BASE_URL"
echo "Scenario: Each iteration does CREATE -> READ -> UPDATE -> DELETE for 1 user"

# Measure total time in Bash
start_time=$(date +%s.%N)

# Summary file from k6
summary_file="$RESULTS_DIR/k6_allinone_${TIMESTAMP}.json"

# Run the single-scenario test
k6 run \
  --vus "$CONCURRENCY" \
  --iterations "$NUM_USERS" \
  --env BASE_URL="$BASE_URL" \
  --summary-export="$summary_file" \
  k6_crud.js \
  > "$RESULTS_DIR/k6_allinone_${TIMESTAMP}.txt"

end_time=$(date +%s.%N)
duration=$(echo "$end_time - $start_time" | bc)

# Parse custom counters from the JSON summary
create_success=$(jq '.metrics.create_checks.count' "$summary_file" || echo 0)
read_success=$(jq '.metrics.read_checks.count'   "$summary_file" || echo 0)
update_success=$(jq '.metrics.update_checks.count' "$summary_file" || echo 0)
delete_success=$(jq '.metrics.delete_checks.count' "$summary_file" || echo 0)

# Each operation was called once per iteration, so total_count = NUM_USERS
total_count="$NUM_USERS"

# Compute ops/sec for each operation
if [[ $(echo "$duration > 0" | bc) -eq 1 ]]; then
  ops_per_sec_create=$(echo "scale=2; $create_success / $duration" | bc)
  ops_per_sec_read=$(echo "scale=2; $read_success / $duration" | bc)
  ops_per_sec_update=$(echo "scale=2; $update_success / $duration" | bc)
  ops_per_sec_delete=$(echo "scale=2; $delete_success / $duration" | bc)
else
  ops_per_sec_create=0
  ops_per_sec_read=0
  ops_per_sec_update=0
  ops_per_sec_delete=0
fi

# Append 4 lines to CSV (CREATE, READ, UPDATE, DELETE)
echo "$TIMESTAMP,$RUNTIME,CREATE,$create_success,$total_count,$duration,$ops_per_sec_create" >> "$CSV_FILE"
echo "$TIMESTAMP,$RUNTIME,READ,$read_success,$total_count,$duration,$ops_per_sec_read" >> "$CSV_FILE"
echo "$TIMESTAMP,$RUNTIME,UPDATE,$update_success,$total_count,$duration,$ops_per_sec_update" >> "$CSV_FILE"
echo "$TIMESTAMP,$RUNTIME,DELETE,$delete_success,$total_count,$duration,$ops_per_sec_delete" >> "$CSV_FILE"

echo "Done! See results in:"
echo " - $RESULTS_DIR/k6_allinone_${TIMESTAMP}.txt (k6 console output)"
echo " - $summary_file (k6 JSON summary)"
echo " - $CSV_FILE (accumulated CSV data)"
