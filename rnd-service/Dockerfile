# Use lightweight Node.js image
#
# Build note: @imgly/background-removal-node pins a nested sharp 0.32.x whose
# install script fetches libvips from GitHub Releases, so `npm ci` here needs
# egress to github.com as well as the npm registry. Deduping that transitive
# sharp onto the root 0.35.x (which uses prebuilt @img/* packages straight from
# the registry) would drop the extra dependency and speed the build up.
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Copy package files and install all dependencies (including devDependencies to compile TS)
COPY package*.json ./
RUN npm ci

# Copy tsconfig and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# --- Production Stage ---
FROM node:20-slim AS runner

WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled code from builder stage
COPY --from=builder /usr/src/app/dist ./dist
# Copy PM2 config
COPY ecosystem.config.js ./

# Expose port (Express server port)
EXPOSE 5000

# Start server using pm2-runtime for clustering in Docker
CMD ["./node_modules/.bin/pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]
