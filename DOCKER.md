# Docker Deployment Guide

This guide explains how to deploy ExtraTracker using Docker and Docker Compose.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Production Deployment](#production-deployment)
- [Development with Docker](#development-with-docker)
- [Environment Variables](#environment-variables)
- [Docker Commands](#docker-commands)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker 20.10+ installed
- Docker Compose 2.0+ installed
- `.env.local` file with all required environment variables (see `.env.example`)

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd extracker

# Copy environment variables
cp .env.example .env.local

# Edit .env.local with your configuration
nano .env.local
```

### 2. Build and Run

**Production:**
```bash
docker-compose up -d
```

**Development:**
```bash
docker-compose -f docker-compose.dev.yml up
```

### 3. Access the Application

- Application: http://localhost:3000
- Health Check: http://localhost:3000/api/health

## Production Deployment

### Building the Docker Image

```bash
# Build the production image
docker build -t extracker:latest .

# Or with Docker Compose
docker-compose build
```

### Running in Production

```bash
# Start the container
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop the container
docker-compose down
```

### Multi-Stage Build Details

The production Dockerfile uses a 3-stage build process:

1. **deps**: Installs production dependencies only
2. **builder**: Builds the Next.js application and generates Prisma Client
3. **runner**: Creates the minimal runtime image with only necessary files

This results in a significantly smaller final image (~200MB vs ~1GB+).

### Image Optimization

The production image is optimized for:
- **Small size**: Alpine Linux base (~200MB final image)
- **Security**: Runs as non-root user (nextjs:nodejs)
- **Performance**: Standalone Next.js output
- **Reliability**: Built-in health checks

## Development with Docker

### Using Development Container

```bash
# Start development container with hot reload
docker-compose -f docker-compose.dev.yml up

# Rebuild after dependency changes
docker-compose -f docker-compose.dev.yml up --build

# Stop development container
docker-compose -f docker-compose.dev.yml down
```

### Development Features

- **Hot Reload**: Source code mounted as volume for instant updates
- **Prisma Studio**: Run `docker exec -it extracker-dev npx prisma studio`
- **Database Migrations**: Run `docker exec -it extracker-dev npm run prisma:push`

## Environment Variables

### Required Variables

Create a `.env.local` file with the following variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres?pgbouncer=true&sslmode=require
DIRECT_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres?sslmode=require

# Auth.js
AUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=https://your-production-domain.com

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email Service (Resend)
RESEND_API_KEY=re_your_api_key_here

# Cron Job Security
CRON_SECRET=generate-with-openssl-rand-base64-32
```

### Generating Secrets

```bash
# Generate AUTH_SECRET
openssl rand -base64 32

# Generate CRON_SECRET
openssl rand -base64 32
```

## Docker Commands

### Container Management

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# Restart containers
docker-compose restart

# View logs
docker-compose logs -f app

# View container status
docker-compose ps

# Execute commands in container
docker exec -it extracker-app sh
```

### Database Operations

```bash
# Generate Prisma Client
docker exec -it extracker-app npx prisma generate

# Push schema changes (development only)
docker exec -it extracker-app npx prisma db push

# Open Prisma Studio (development only)
docker exec -it extracker-dev npx prisma studio

# Seed database
docker exec -it extracker-app npm run prisma:seed
```

### Image Management

```bash
# Build image
docker build -t extracker:latest .

# Tag image for registry
docker tag extracker:latest your-registry/extracker:latest

# Push to registry
docker push your-registry/extracker:latest

# Remove unused images
docker image prune -a
```

### Health Checks

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' extracker-app

# View health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' extracker-app

# Manual health check
curl http://localhost:3000/api/health
```

## Troubleshooting

### Container Won't Start

1. Check logs for errors:
   ```bash
   docker-compose logs app
   ```

2. Verify environment variables:
   ```bash
   docker exec -it extracker-app env | grep DATABASE_URL
   ```

3. Check database connection:
   ```bash
   docker exec -it extracker-app node -e "require('@prisma/client').PrismaClient().then(p => p.\$queryRaw\`SELECT 1\`)"
   ```

### Database Connection Issues

1. Ensure `DATABASE_URL` is correctly formatted
2. Check if database is accessible from Docker network
3. Verify Supabase connection pooling is enabled
4. Test connection:
   ```bash
   docker exec -it extracker-app npm run db:test
   ```

### Build Failures

1. Clear Docker cache and rebuild:
   ```bash
   docker-compose build --no-cache
   ```

2. Check Dockerfile for syntax errors
3. Ensure all dependencies are in `package.json`
4. Verify Node.js version compatibility

### Permission Issues

The container runs as non-root user `nextjs` (uid 1001). If you encounter permission issues:

1. Check file ownership in container:
   ```bash
   docker exec -it extracker-app ls -la
   ```

2. Adjust permissions if needed (development only):
   ```bash
   docker exec -u root -it extracker-dev chown -R nextjs:nodejs /app
   ```

### Memory Issues

If the build fails due to memory constraints:

1. Increase Docker memory limit (Docker Desktop settings)
2. Use build args to limit memory:
   ```bash
   docker build --memory=4g -t extracker:latest .
   ```

### Hot Reload Not Working (Development)

1. Ensure volumes are correctly mounted:
   ```bash
   docker-compose -f docker-compose.dev.yml config
   ```

2. Check if files are being watched:
   ```bash
   docker exec -it extracker-dev ls -la /app
   ```

3. Restart the development container:
   ```bash
   docker-compose -f docker-compose.dev.yml restart
   ```

## Production Best Practices

### Security

1. **Never commit secrets**: Use environment variables or secrets management
2. **Use non-root user**: Production Dockerfile already configured
3. **Scan for vulnerabilities**: `docker scan extracker:latest`
4. **Keep base image updated**: Regularly rebuild with latest Alpine

### Performance

1. **Enable HTTP/2**: Use a reverse proxy (Nginx, Traefik)
2. **Use CDN**: Serve static assets via CDN
3. **Enable caching**: Configure Next.js caching headers
4. **Monitor resources**: Use Docker stats or monitoring tools

### Scaling

1. **Horizontal scaling**: Run multiple containers behind load balancer
2. **Database pooling**: Already configured with Supabase Prisma
3. **Redis caching**: Consider adding Redis for session storage
4. **Queue workers**: Separate notification processing into queue

### Monitoring

1. **Health checks**: Already configured in Dockerfile
2. **Logging**: Use `docker-compose logs` or external logging service
3. **Metrics**: Integrate Prometheus or DataDog
4. **Alerts**: Set up alerts for health check failures

## Deployment Platforms

### AWS ECS

```bash
# Build and push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
docker build -t extracker:latest .
docker tag extracker:latest <account-id>.dkr.ecr.<region>.amazonaws.com/extracker:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/extracker:latest
```

### Google Cloud Run

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/<project-id>/extracker
gcloud run deploy extracker --image gcr.io/<project-id>/extracker --platform managed
```

### DigitalOcean App Platform

```yaml
# app.yaml
name: extracker
services:
  - name: web
    dockerfile_path: Dockerfile
    github:
      repo: your-org/extracker
      branch: main
    envs:
      - key: NODE_ENV
        value: production
```

### Fly.io

```bash
# Deploy to Fly.io
fly launch
fly deploy
```

## Support

For issues or questions:
- Check [troubleshooting section](#troubleshooting)
- Review Docker logs: `docker-compose logs`
- Open an issue on GitHub
- Contact support team

## License

See [LICENSE](LICENSE) file for details.
