# Escape deployment

The production app is served at `https://linkukai.com/games/Escape/`.

- HAProxy owns TCP 443 and routes by TLS SNI.
- `linkukai.com` is passed to Nginx on `127.0.0.1:8444`.
- Other SNI values are passed to the existing Xray Reality listener on `127.0.0.1:8443`.
- Nginx serves the active static release through `/var/www/linkukai/public/games/Escape`.
- Let's Encrypt uses the webroot `/var/www/certbot` on TCP 80.
- The origin certificate is read from `/etc/nginx/ssl/linkukai`; Cloudflare
  terminates the public certificate and connects to this encrypted origin.

Each deployment uploads a new immutable directory under
`/var/www/linkukai/escape/releases/<git-sha>` and changes only the
`/var/www/linkukai/public/games/Escape` symlink after upload verification.
