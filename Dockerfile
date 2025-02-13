# Use the official Deno image as the base image for building
# FROM denoland/deno:alpine-2.1.9 AS builder
FROM denoland/deno:debian-2.1.9 AS builder

# Set the working directory in the container
WORKDIR /app

# Copy the application files to the container
COPY . .

# Cache dependencies from deno.json
RUN deno cache --lock=deno.lock main.ts

# Compile the application to a binary
RUN deno compile -A --output mantle main.ts

# Install glibc
# FROM frolvlad/alpine-glibc:alpine-3.20
FROM debian:bookworm-slim

# Set the working directory in the container
WORKDIR /app

# Copy only the compiled binary from the builder stage
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/mantle .

# Make sure the binary is executable
RUN chmod +x /app/mantle

# Expose the port your application runs on (adjust if necessary)
EXPOSE 4001 

# Run the compiled binary
CMD ["./mantle"]

