# Use Alpine-based Deno image
FROM denoland/deno:alpine-2.1.9

# Set the working directory in the container
WORKDIR /app

# Copy application files
COPY . .

# Cache dependencies
RUN deno cache --lock=deno.lock main.ts

# Expose the port your application runs on
EXPOSE 4001

# Run the application
CMD ["deno", "run", "-A", "main.ts"]

