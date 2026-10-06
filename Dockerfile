# Stage 1: build the Angular application.
FROM node:24.21.0-alpine AS builder
WORKDIR /application

# dependencies first: this layer is rebuilt only when the lock file changes
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

# the release workflow passes the tag and the commit; they are shown on the About page
ARG APP_VERSION=0.0.0-dev
ARG GIT_COMMIT=unknown
RUN APP_VERSION="${APP_VERSION}" GIT_COMMIT="${GIT_COMMIT}" node scripts/stamp-build-info.mjs \
    && npm run build \
    && npm run check:bundle

# Stage 2: nginx serving the static files. The unprivileged image runs as a non-root user and
# listens on 8080; it writes only to /tmp, so the container works with a read-only root filesystem.
FROM nginxinc/nginx-unprivileged:1.30.5-alpine
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /application/dist/web-application/browser /usr/share/nginx/html

EXPOSE 8080
