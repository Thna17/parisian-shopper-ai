/* global afterAll */
const http = require('node:http');
const https = require('node:https');

afterAll(async () => {
  if (http.globalAgent && typeof http.globalAgent.destroy === 'function') {
    http.globalAgent.destroy();
  }
  if (https.globalAgent && typeof https.globalAgent.destroy === 'function') {
    https.globalAgent.destroy();
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
});
