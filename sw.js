import pkceChallenge from 'https://unpkg.com/pkce-challenge@4.1.0/dist/index.browser.js';

// Edit these for your environment  ---v
const IDP_HOST = 'oidc.example.com';
const client_id = 'OIDC_TEST';
// Edit these for your environment  ---^

// install immediately
addEventListener("install", (event) => {
  return event.waitUntil(() => Promise.resolve());
});
// activate immediately
addEventListener("activate", (event) => {
  return event.waitUntil(() => Promise.resolve());
});

addEventListener("message", async (event) => {
  if (event.data === 'refresh') {
    const response = await fetch(new URL(`${self.serviceWorker.idp.token_endpoint}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id,
        grant_type: 'refresh_token',
        refresh_token: self.serviceWorker.tokens.refresh_token,
      }).toString()
    });

    const tokens = self.serviceWorker.tokens = {
      ...await response.json(),
      id_token: self.serviceWorker.tokens.id_token,
    };
    const id = decodeToken(tokens.id_token);
    const access = decodeToken(tokens.access_token);

    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ tokens, id, access });
    }
  }
});

// activate immediately
addEventListener("fetch", (event) => {
  return event.respondWith(oidcFetch(event.request));
});

async function oidcFetch(request) {
  const scope = new URL(self.registration.scope);
  const url = new URL(request.url);

  if (!self.serviceWorker.idp) {
    console.log(`Loading oidc metadata from: ${IDP_HOST}`);
    const response = await fetch(`https://${IDP_HOST}/auth/protocol/oidc/.well-known/openid-configuration`);
    self.serviceWorker.idp = await response.json();
  }

  console.log(`fetching: ${url.pathname} ${url}`);

  if (scope.origin === url.origin && url.pathname === '/login') {
    const { code_verifier, code_challenge } = await pkceChallenge(64);
    self.serviceWorker.code_verifier = code_verifier; // save for later

    const state = Math.random().toString(36).substring(2);
    const nonce = Math.random().toString(36).substring(2);

    return Response.redirect(`${self.serviceWorker.idp.authorization_endpoint}?${new URLSearchParams({
      client_id,
      response_type: 'code',
      scope: 'openid',
      redirect_uri: new URL('/callback', scope).toString(),
      code_challenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    }) }`);
  } else if (scope.origin === url.origin && url.pathname === '/callback') {
    if (self.serviceWorker.code_verifier && !self.serviceWorker.auth_code) {
      self.serviceWorker.auth_code = url.searchParams.get('code'); // save for later

      const {} = url.searchParams;
      const response = await fetch(
        new URL(`${self.serviceWorker.idp.token_endpoint}`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id,
            grant_type: 'authorization_code',
            redirect_uri: new URL('/callback', scope).toString(),
            code: self.serviceWorker.auth_code,
            code_verifier: self.serviceWorker.code_verifier,
          }).toString()
        }
      );
      delete self.serviceWorker.auth_code;
      delete self.serviceWorker.code_verifier;

      const tokens = self.serviceWorker.tokens = await response.json();
      const id = decodeToken(tokens.id_token);
      const access = decodeToken(tokens.access_token);

      const clients = await self.clients.matchAll();
      for (const client of clients) {
        client.postMessage({ tokens, id, access });
      }
    }

    return new Response('<html><head><script type="application/javascript">window.close()</script></head><body></body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } else {
    return fetch(request);
  }
};

function decodeToken(token) {
  return token.split('.').map((part, i) => {
    if (i < 2) {
      // b64web
      part = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    }
    return part;
  });
};
