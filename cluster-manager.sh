#!/usr/bin/env bash
set -eo pipefail

CLUSTER_NAME="js-runtimes-cluster"
CONFIG_FILE="$(mktemp --suffix=.yaml)"

create_cluster() {
    # Generate Kind config with port mappings
    cat <<EOF > "$CONFIG_FILE"
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 30000
    hostPort: 3000
    protocol: TCP
  - containerPort: 31000
    hostPort: 5000
    protocol: TCP
  - containerPort: 32000
    hostPort: 8000
    protocol: TCP
EOF

    # Create new cluster
    kind create cluster --name "$CLUSTER_NAME" --config "$CONFIG_FILE"
    
    # Build with explicit local tags
    docker build -t goodeesh/my-node-app:local -f node/Dockerfile ./node
    docker build -t goodeesh/my-bun-app:local -f bun/Dockerfile ./bun
    docker build -t goodeesh/my-deno-app:local -f deno/Dockerfile ./deno

    # Load images into Kind with verification
    echo "Loading images into Kind cluster..."
    kind load docker-image goodeesh/my-node-app:local --name "$CLUSTER_NAME"
    kind load docker-image goodeesh/my-bun-app:local --name "$CLUSTER_NAME"
    kind load docker-image goodeesh/my-deno-app:local --name "$CLUSTER_NAME"

    # Verify images are loaded
    echo "Verifying images in Kind cluster:"
    docker exec "$CLUSTER_NAME"-control-plane crictl images | grep goodeesh

    # Create modified deployment files
    echo "Updating deployment manifests..."
    mkdir -p temp_k8s
    cp -r k8s/* temp_k8s/
    
    # Update image tags
    find temp_k8s -name "deployment.yaml" -exec sed -i 's/:latest/:local/g' {} \;
    
    # Update image pull policy (safely)
    for file in $(find temp_k8s -name "deployment.yaml"); do
      if ! grep -q "imagePullPolicy:" "$file"; then
        sed -i '/image:/a\        imagePullPolicy: Never' "$file"
      fi
    done
    
    # Apply configurations from temp directory
    echo "Applying Kubernetes configurations..."
    kubectl apply -k temp_k8s/
    
    # Clean up temp directory
    rm -rf temp_k8s
    
    echo "Cluster created! Access services via:"
    echo "- Node.js: http://localhost:3000"
    echo "- Bun: http://localhost:5000"
    echo "- Deno: http://localhost:8000"
}

delete_cluster() {
    kind delete cluster --name "$CLUSTER_NAME"
    echo "Cluster deleted"
}

verify_cluster() {
    kubectl get pods -o wide
    kubectl get svc
    kubectl get hpa
}

case "$1" in
    create)
        create_cluster
        ;;
    delete)
        delete_cluster
        ;;
    verify)
        verify_cluster
        ;;
    *)
        echo "Usage: $0 {create|delete|verify}"
        exit 1
        ;;
esac

# Cleanup
rm -f "$CONFIG_FILE" 