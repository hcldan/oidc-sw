import express from 'express';
import http from 'http';
import fs from 'fs';

const app = express();

app.get('/', (req, res) => {
  res.contentType('text/html');
  res.status(200).send(fs.readFileSync('./index.html').toString());
});
app.get('/sw.js', (req, res) => {
  res.contentType('application/javascript');
  res.status(200).send(fs.readFileSync('./sw.js').toString());
});

// This is to prevent any page from unregistering the serviceworker
// and trying somehow to get the auth_code from the query param.
app.get('/callback', async (req, res) => {
  // Add delay to test if params are available while client waits for
  // server/network to respond.
  setTimeout(() => res.redirect(302, '/404'), 1000);
});

http.createServer(app).listen(3000);
