#!/usr/bin/env bash
set -eo pipefail

create_cluster() {
    # List available contexts
    echo "Available Kubernetes contexts:"
    kubectl config get-contexts
    
    # Ask user to select the OrbStack context
    echo ""
    echo "Please enter the NAME of your OrbStack Kubernetes context from the list above:"
    read -r ORBSTACK_CONTEXT
    
    # Validate context exists
    if ! kubectl config get-contexts | grep -q "$ORBSTACK_CONTEXT"; then
        echo "Error: Context '$ORBSTACK_CONTEXT' not found."
        echo "Please ensure OrbStack is running with Kubernetes enabled."
        exit 1
    fi
    
    # Switch to the selected context
    echo "Switching to context: $ORBSTACK_CONTEXT"
    kubectl config use-context "$ORBSTACK_CONTEXT"
    
    # Rest of the function remains the same
    # Build with explicit local tags
    echo "Building Docker images..."
    docker build -t goodeesh/my-node-app:local -f node/Dockerfile ./node
    docker build -t goodeesh/my-bun-app:local -f bun/Dockerfile ./bun
    docker build -t goodeesh/my-deno-app:local -f deno/Dockerfile ./deno

    # Create modified deployment files
    echo "Updating deployment manifests..."
    mkdir -p temp_k8s
    cp -r k8s/* temp_k8s/
    
    # Update image tags (macOS compatible)
    find temp_k8s -name "deployment.yaml" -exec sed -i '' 's/:latest/:local/g' {} \;
    
    # Update image pull policy (macOS compatible)
    for file in $(find temp_k8s -name "deployment.yaml"); do
      if ! grep -q "imagePullPolicy:" "$file"; then
        sed -i '' '/image:/a\
        imagePullPolicy: Never' "$file"
      fi
    done
    
    # Apply configurations
    echo "Applying Kubernetes configurations..."
    kubectl apply -k temp_k8s/
    
    # Clean up temp directory
    rm -rf temp_k8s
    
    echo "Deployed to OrbStack Kubernetes! Access services via NodePorts"
    echo "Run './orbstack-cluster-manager.sh verify' to get access information"
}

delete_resources() {
    echo "Deleting Kubernetes resources..."
    kubectl delete -k k8s/ || true
    echo "Resources deleted"
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
    
    # Use the known service names
    NODE_SERVICE="node-app-service"
    BUN_SERVICE="bun-app-service"
    DENO_SERVICE="deno-app-service"
    
    # Kill any existing port-forward processes
    pkill -f "kubectl port-forward svc" || true
    
    # Set up port forwarding in the background with the correct ports
    echo "Setting up port forwarding for $NODE_SERVICE to localhost:3000..."
    kubectl port-forward svc/$NODE_SERVICE 3000:3000 &
    
    echo "Setting up port forwarding for $BUN_SERVICE to localhost:5000..."
    kubectl port-forward svc/$BUN_SERVICE 5000:5000 &
    
    echo "Setting up port forwarding for $DENO_SERVICE to localhost:8000..."
    kubectl port-forward svc/$DENO_SERVICE 8000:8000 &
    
    echo -e "\nPort forwarding established!"
    echo "- Node.js: http://localhost:3000"
    echo "- Bun: http://localhost:5000"
    echo "- Deno: http://localhost:8000"
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
        delete_resources
        ;;
    verify)
        verify_cluster
        ;;
    forward)
        port_forward
        ;;
    *)
        echo "Usage: $0 {create|delete|verify|forward}"
        exit 1
        ;;
esac