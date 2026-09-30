# For machines without Chrome or Edge. Playwright's image ships a matching Chromium.
#   docker build -t ld-experiment-visitors .
#   docker run --rm -it -v "$PWD/journey.json:/journey.json:ro" ld-experiment-visitors /journey.json
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY bin ./bin
COPY src ./src
ENTRYPOINT ["node", "bin/cli.mjs"]
CMD ["--help"]
