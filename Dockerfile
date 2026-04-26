# Multi-stage build for the WhyMail Vite SPA, served by nginx.
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies first to leverage layer caching.
COPY package.json package-lock.json* ./
RUN npm ci

# Vite inlines VITE_* env vars at build time, so they must be present here.
# Pass them as Docker build args (Zeabur maps Variables -> build args).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ENABLE_ROUTE_MESSAGING=true
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_ENABLE_ROUTE_MESSAGING=$VITE_ENABLE_ROUTE_MESSAGING

COPY . .
RUN npm run build

# ---- Runtime: tiny nginx serving the static dist/ output ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
