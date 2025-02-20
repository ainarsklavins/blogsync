#!/bin/bash
# Execute this script with:
# chmod +x deploy.sh && ./deploy.sh


# Configuration
PROJECT_ID="book-translator-439914"  # Your GCP project ID
REGION="us-central1"                 # Your preferred region
SERVICE_NAME="blog-sync-service"     # Name for your Cloud Run service
REPO_NAME="blog-sync-repo"          # Artifact Registry repository name
IMAGE_NAME="blog-sync"               # Name for your container image
REGISTRY_URL="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME"  # Artifact Registry URL

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m'

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo -e "${GREEN}🚀 Starting deployment process...${NC}"

# Configure Docker for Artifact Registry
echo -e "${GREEN}🔐 Configuring Docker authentication...${NC}"
gcloud auth configure-docker $REGION-docker.pkg.dev

# Install dependencies
echo -e "${GREEN}📦 Installing dependencies...${NC}"
npm install

# Load environment variables
echo -e "${GREEN}📝 Loading environment variables...${NC}"
set -a
source .env.production
set +a

# Create and use a new builder instance
echo -e "${GREEN}🔧 Setting up Docker builder...${NC}"
docker buildx create --use --name cloud-run-builder || true
docker buildx inspect --bootstrap

# Build and push the container image directly to Artifact Registry
echo -e "${GREEN}📦 Building and pushing container image...${NC}"
docker buildx build --platform linux/amd64 \
  --push \
  -t "$REGISTRY_URL/$IMAGE_NAME:latest" \
  --build-arg DATABASE_URL="$DATABASE_URL" \
  --build-arg DATABASE_URL_NON_POOLING="$DATABASE_URL_NON_POOLING" \
  --build-arg GCS_PROJECT_ID="$GCS_PROJECT_ID" \
  --build-arg GCS_BUCKET_NAME="$GCS_BUCKET_NAME" \
  --build-arg GCS_CLIENT_EMAIL="$GCS_CLIENT_EMAIL" \
  --build-arg GCS_PRIVATE_KEY="$GCS_PRIVATE_KEY" \
  --build-arg SEOBOT_API_KEY="$SEOBOT_API_KEY" \
  --build-arg NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
  .

# Create environment variables string
echo -e "${GREEN}📝 Preparing environment variables...${NC}"
ENV_VARS=""
while IFS='=' read -r key value || [[ -n "$key" ]]; do
    # Skip comments and empty lines
    [[ $key =~ ^#.*$ ]] || [[ -z $key ]] && continue
    # Clean the key and value
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//' -e "s/^[[:space:]]*'//" -e "s/'[[:space:]]*$//")
    # Escape special characters in value
    value=$(echo "$value" | sed 's/"/\\"/g')
    # Add to env vars string
    ENV_VARS="${ENV_VARS}${key}=${value},"
done < .env.production

# Remove trailing comma
ENV_VARS=${ENV_VARS%,}

# Deploy to Cloud Run
echo -e "${GREEN}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
  --image "$REGISTRY_URL/$IMAGE_NAME:latest" \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --set-env-vars="$ENV_VARS" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80

# Clean up
echo -e "${GREEN}🧹 Cleaning up...${NC}"
docker buildx rm cloud-run-builder

echo -e "${GREEN}✅ Deployment completed!${NC}" 