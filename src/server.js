import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from './app.js';
import { config } from './config.js';

function toWebRequest(req) {
  const protocol = req.socket.encrypted ? 'https' : 'http';
  const url = `${protocol}://${req.headers.host || 'localhost'}${req.url || '/'}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value != null) {
      headers.set(key, value);
    }
  }

  const init = {
    method: req.method || 'GET',
    headers
  };

  if (init.method !== 'GET' && init.method !== 'HEAD') {
    init.body = req;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

async function writeNodeResponse(res, webResponse) {
  res.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const body = Buffer.from(await webResponse.arrayBuffer());
  res.end(body);
}

export function createLocalServer() {
  return createServer(async (req, res) => {
    const webResponse = await handleRequest(toWebRequest(req));
    await writeNodeResponse(res, webResponse);
  });
}

export function startServer(port = config.port) {
  const server = createLocalServer();
  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
  return server;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  startServer();
}
