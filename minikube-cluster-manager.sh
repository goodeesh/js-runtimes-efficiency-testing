#!/usr/bin/env bash
set -eo pipefail

create_cluster() {
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
    
    KUBERNETES_CONTEXT="minikube"
    # Validate context exists
    if ! kubectl config get-contexts | grep -q "$KUBERNETES_CONTEXT"; then
        echo "Error: Context '$KUBERNETES_CONTEXT' not found."
        echo "Please ensure OrbStack is running with Kubernetes enabled."
        exit 1
    fi
    
    # Switch to the selected context
    echo "Switching to context: $KUBERNETES_CONTEXT"
    kubectl config use-context "$KUBERNETES_CONTEXT"
    
    # Use Minikube's Docker daemon for building
    echo "Setting up Docker environment inside Minikube..."
    eval $(minikube docker-env)

    # Build PostgreSQL image if Node.js or Deno is selected
    if [ "$RUNTIME" == "node" ] || [ "$RUNTIME" == "deno" ]; then
        echo "Building PostgreSQL image inside Minikube..."
        docker build -t my-postgres:local -f k8s/postgres/Dockerfile k8s/postgres
    fi

    echo "Building Docker image for $RUNTIME inside Minikube..."
    docker build -t goodeesh/my-$RUNTIME-app:local -f $RUNTIME/Dockerfile ./$RUNTIME

    # Create modified deployment files
    echo "Updating deployment manifests for $RUNTIME..."
    mkdir -p temp_k8s/$RUNTIME
    mkdir -p temp_k8s/common
    mkdir -p temp_k8s/postgres
    
    # Copy only the selected runtime files and common files
    cp -r k8s/$RUNTIME/* temp_k8s/$RUNTIME/
    cp -r k8s/common/* temp_k8s/common/
    
    # Copy PostgreSQL files if Node.js or Deno is selected
    if [ "$RUNTIME" == "node" ] || [ "$RUNTIME" == "deno" ]; then
        cp -r k8s/postgres/* temp_k8s/postgres/
    fi
    
    # Create a custom kustomization.yaml for the selected runtime
    if [ "$RUNTIME" == "node" ] || [ "$RUNTIME" == "deno" ]; then
        cat > temp_k8s/kustomization.yaml <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
- postgres/deployment.yaml
- postgres/service.yaml
- $RUNTIME/deployment.yaml
- $RUNTIME/service.yaml
- $RUNTIME/hpa.yaml
- common/metrics.yaml
EOF
    else
        cat > temp_k8s/kustomization.yaml <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
- $RUNTIME/deployment.yaml
- $RUNTIME/service.yaml
- $RUNTIME/hpa.yaml
- common/metrics.yaml
EOF
    fi
    
    # Detect OS and use appropriate sed syntax
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        echo "Detected macOS, using compatible sed commands..."
        
        # Update image tags (macOS compatible)
        find temp_k8s -name "deployment.yaml" -exec sed -i '' 's/:latest/:local/g' {} \;
        
        # Update image pull policy (macOS compatible)
        for file in $(find temp_k8s -name "deployment.yaml"); do
          if ! grep -q "imagePullPolicy:" "$file"; then
            sed -i '' '/image:/a\
            imagePullPolicy: Never' "$file"
          fi
        done
    else
        # Linux
        echo "Detected Linux, using compatible sed commands..."
        
        # Update image tags (Linux compatible)
        find temp_k8s -name "deployment.yaml" -exec sed -i 's/:latest/:local/g' {} \;
        
        # Update image pull policy (Linux compatible)
        for file in $(find temp_k8s -name "deployment.yaml"); do
          if ! grep -q "imagePullPolicy:" "$file"; then
            sed -i '/image:/ a\        imagePullPolicy: Never' "$file"
          fi
        done
    fi
    
    # Apply configurations
    echo "Applying Kubernetes configurations for $RUNTIME..."
    kubectl apply -k temp_k8s/
    
    # Clean up temp directory
    rm -rf temp_k8s
    
    echo "Deployed $RUNTIME to OrbStack Kubernetes! Access service via NodePort"
    echo "Run './orbstack-cluster-manager.sh verify' to get access information"
    
    # Store the selected runtime for other commands
    echo "$RUNTIME" > .selected_runtime
    echo "$PORT" > .selected_port
}

get_direct_url() {
    # Check if a specific runtime was selected
    if [[ -f .selected_runtime ]]; then
        RUNTIME=$(cat .selected_runtime)
    else
        echo "No runtime selected. Please run 'create' command first."
        echo "Or specify which runtime to check:"
        echo "1) Node.js"
        echo "2) Bun"
        echo "3) Deno"
        read -p "Enter your choice (1-3): " runtime_choice
        
        case "$runtime_choice" in
            1) RUNTIME="node" ;;
            2) RUNTIME="bun" ;;
            3) RUNTIME="deno" ;;
            *) 
                echo "Invalid choice. Please select 1, 2, or 3."
                exit 1
                ;;
        esac
    fi
    
    # Get Minikube IP
    MINIKUBE_IP=$(minikube ip)
    if [ $? -ne 0 ]; then
        echo "Error: Failed to get Minikube IP. Is Minikube running?"
        exit 1
    fi
    
    # Get the NodePort for the service
    SERVICE="${RUNTIME}-app-service"
    NODE_PORT=$(kubectl get svc $SERVICE -o jsonpath='{.spec.ports[0].nodePort}')
    if [ $? -ne 0 ] || [ -z "$NODE_PORT" ]; then
        echo "Error: Failed to get NodePort for $SERVICE. Is the service deployed?"
        exit 1
    fi
    
    # Print the direct URL
    echo "Direct access URL for $RUNTIME:"
    echo "http://$MINIKUBE_IP:$NODE_PORT"
    echo ""
    echo "For benchmarking, use:"
    echo "./bombardier -c \$concurrency -n \$REQUESTS \"http://$MINIKUBE_IP:$NODE_PORT/json-small\""
}

# Add this function to orbstack-cluster-manager.sh
setup_monitoring() {
    echo "Setting up Prometheus and Grafana for monitoring..."
    
    # Create monitoring namespace if it doesn't exist
    kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
    
    # Add Helm repositories
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    
    # Check if prometheus is already installed
    if helm list -n monitoring | grep -q "prometheus"; then
        echo "Prometheus is already installed. Upgrading..."
        helm upgrade prometheus prometheus-community/prometheus \
            --namespace monitoring \
            --set server.persistentVolume.enabled=false \
            --set alertmanager.persistentVolume.enabled=false
    else
        # Install Prometheus
        echo "Installing Prometheus..."
        helm install prometheus prometheus-community/prometheus \
            --namespace monitoring \
            --set server.persistentVolume.enabled=false \
            --set alertmanager.persistentVolume.enabled=false
    fi
    
    # Check if grafana is already installed
    if helm list -n monitoring | grep -q "grafana"; then
        echo "Grafana is already installed. Upgrading..."
        helm upgrade grafana grafana/grafana \
            --namespace monitoring \
            --set persistence.enabled=true \
            --set adminPassword=admin123 \
            --set service.type=ClusterIP
    else
        # Install Grafana
        echo "Installing Grafana..."
        helm install grafana grafana/grafana \
            --namespace monitoring \
            --set persistence.enabled=true \
            --set adminPassword=admin123 \
            --set service.type=ClusterIP
    fi
    
    # Create ConfigMap with our dashboard
    kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: js-runtime-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "true"
data:
  js-runtime-dashboard.json: |-
    {
      "annotations": { "list": [] },
      "editable": true,
      "fiscalYearStartMonth": 0,
      "graphTooltip": 0,
      "links": [],
      "liveNow": false,
      "panels": [
        {
          "datasource": { "type": "prometheus", "uid": "prometheus" },
          "description": "CPU usage by pod",
          "fieldConfig": { "defaults": {} },
          "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
          "id": 1,
          "title": "CPU Usage by Runtime",
          "type": "timeseries"
        }
      ],
      "refresh": "5s",
      "schemaVersion": 38,
      "title": "JavaScript Runtime Comparison",
      "version": 0
    }
EOF
    
    # Wait for Grafana pod to be ready before port forwarding
    echo "Waiting for Grafana to be ready..."
    kubectl rollout status deployment/grafana -n monitoring --timeout=120s
    
    echo "Setting up port forwarding to access Grafana..."
    # Kill any existing Grafana port forward
    pkill -f "kubectl.*port-forward.*3001:80" || true
    
    kubectl port-forward -n monitoring svc/grafana 3001:80 &
    GRAFANA_PID=$!
    
    echo "Grafana is being set up! In a moment you will be able to access it at:"
    echo "http://localhost:3001"
    echo "Username: admin"
    echo "Password: admin123"
    
    # Store PID for cleanup
    echo $GRAFANA_PID > .grafana_pid
    
    echo "Monitoring setup complete!"
}

delete_resources() {
    echo "Deleting Kubernetes resources..."
    
    # Cleanup Grafana monitoring if running
    if [[ -f .grafana_pid ]]; then
        echo "Stopping Grafana port forwarding..."
        GRAFANA_PID=$(cat .grafana_pid)
        kill $GRAFANA_PID 2>/dev/null || true
        rm .grafana_pid
    fi
    
    # Also clean up the Helm deployments if they exist
    if kubectl get namespace monitoring &>/dev/null; then
        echo "Deleting monitoring stack..."
        helm uninstall prometheus --namespace monitoring 2>/dev/null || true
        helm uninstall grafana --namespace monitoring 2>/dev/null || true
    fi
    
    kubectl delete -k k8s/ || true
    echo "Resources deleted"
}

clean_apps() {
    echo "Cleaning application resources..."
    
    # Force delete all app resources regardless of whether we detect them or not
    echo "Removing all runtime deployments and related resources..."
    
    # First delete by specific runtime label if we know which one
    if [[ -f .selected_runtime ]]; then
        RUNTIME=$(cat .selected_runtime)
        echo "Targeting $RUNTIME resources specifically..."
        
        # Delete by label with force option
        kubectl delete deployment,service,hpa,pod -l app=${RUNTIME}-app --grace-period=0 --force --timeout=30s 2>/dev/null || true
    fi
    
    # Then try more general approach for anything that might be left
    echo "Cleaning up any remaining resources..."
    
    # Delete all deployment, service, hpa for any runtime and postgres
    kubectl delete deployment,service,hpa,pod -l "app in (node-app,bun-app,deno-app,postgres)" --grace-period=0 --force --timeout=30s 2>/dev/null || true
    
    # Delete PostgreSQL PVC and secrets if they exist
    kubectl delete pvc postgres-pvc --grace-period=0 --force --timeout=30s 2>/dev/null || true
    kubectl delete secret postgres-secret --grace-period=0 --force --timeout=30s 2>/dev/null || true
    
    # Also delete from k8s directory as fallback
    kubectl delete -k k8s/ --grace-period=0 --force --timeout=30s 2>/dev/null || true
    
    # Delete metrics server and related resources
    echo "Cleaning up metrics server resources..."
    kubectl delete -f k8s/common/metrics.yaml --grace-period=0 --force --timeout=30s 2>/dev/null || true
    
    # Wait briefly to allow resources to be terminated
    echo "Waiting for resources to be fully terminated..."
    sleep 5
    
    # Verify no app pods remain
    if kubectl get pods -l "app in (node-app,bun-app,deno-app)" 2>/dev/null | grep -q "Running"; then
        echo "WARNING: Some pods still exist. Forcing deletion..."
        kubectl delete pods -l "app in (node-app,bun-app,deno-app)" --grace-period=0 --force --timeout=10s 2>/dev/null || true
    else
        echo "All application pods have been removed."
    fi
    
    # Clean up the runtime selection files
    rm -f .selected_runtime .selected_port 2>/dev/null || true
    echo "Application resources deleted."
}

verify_cluster() {
    echo "Checking deployment status:"
    kubectl get pods -o wide
    echo -e "\nServices:"
    kubectl get svc
    echo -e "\nNode IP for accessing services:"
    kubectl get nodes -o wide | grep -v NAME | awk '{print $6}'
    echo -e "\nUse these NodePorts with the IP above:"
    kubectl get svc | grep NodePort
}

port_forward() {
    echo "Setting up port forwarding..."
    
    # Check if a specific runtime was selected previously
    if [[ -f .selected_runtime && -f .selected_port ]]; then
        RUNTIME=$(cat .selected_runtime)
        PORT=$(cat .selected_port)
        
        # Kill any existing port-forward processes
        pkill -f "kubectl port-forward svc" || true
        
        SERVICE="${RUNTIME}-app-service"
        echo "Setting up port forwarding for $SERVICE to localhost:$PORT..."
        kubectl port-forward svc/$SERVICE $PORT:$PORT &
        
        echo -e "\nPort forwarding established!"
        echo "- $RUNTIME: http://localhost:$PORT"
    else
        echo "No runtime selected. Please run 'create' command first."
        echo "Or specify which runtime to forward:"
        echo "1) Node.js (port 3000)"
        echo "2) Bun (port 5000)"
        echo "3) Deno (port 8000)"
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
        
        # Kill any existing port-forward processes
        pkill -f "kubectl port-forward svc" || true
        
        SERVICE="${RUNTIME}-app-service"
        echo "Setting up port forwarding for $SERVICE to localhost:$PORT..."
        kubectl port-forward svc/$SERVICE $PORT:$PORT &
        
        echo -e "\nPort forwarding established!"
        echo "- $RUNTIME: http://localhost:$PORT"
    fi
    
    # Set up Grafana port forwarding if monitoring namespace exists
    if kubectl get namespace monitoring &>/dev/null; then
        kubectl port-forward -n monitoring svc/grafana 3001:80 &
        echo "- Grafana: http://localhost:3001"
    fi
    
    echo ""
    echo "Press Ctrl+C to stop port forwarding when done."
    
    # Wait for user to press Ctrl+C
    wait
}

# Command handler
case "$1" in
    create)
        create_cluster
        ;;
    delete)
        clean_apps
        ;;
    verify)
        verify_cluster
        ;;
    forward)
        port_forward
        ;;
    setup-monitoring)
        setup_monitoring
        ;;
    get-url)
        get_direct_url
        ;;
    *)
        echo "Usage: $0 {create|delete|verify|forward|setup-monitoring}"
        exit 1
        ;;
esac