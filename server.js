const http = require('http');
const https = require('https');
const PORT = process.env.PORT || 3000;

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({ raw: data }); }});
    }).on('error', reject);
  });
}

function httpsPost(hostname, path, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(bodyObj);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({ raw: data }); }});
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(); return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/') return sendJSON(res, 200, { status: 'DropBot server running' });

  if (url.pathname === '/telegram') {
    const token = url.searchParams.get('token');
    const chat_id = url.searchParams.get('chat_id');
    const text = url.searchParams.get('text');
    if (!token || !chat_id || !text) return sendJSON(res, 400, { error: 'Missing params' });
    try {
      const result = await httpsGet(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${encodeURIComponent(chat_id)}&text=${encodeURIComponent(text)}&parse_mode=Markdown`);
      return sendJSON(res, 200, result);
    } catch(err) { return sendJSON(res, 500, { error: err.message }); }
  }

  if (url.pathname === '/ai' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body);
      const { apiKey, system, prompt } = payload;
      if (!apiKey) return sendJSON(res, 400, { error: 'Missing apiKey' });
      const result = await httpsPost('api.anthropic.com', '/v1/messages', {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }, {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: system || 'You are DropBot, an expert dropshipping assistant.',
        messages: [{ role: 'user', content: prompt }]
      });
      return sendJSON(res, 200, result);
    } catch(err) { return sendJSON(res, 500, { error: err.message }); }
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log(`DropBot server on port ${PORT}`));
