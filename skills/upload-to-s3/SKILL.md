---
name: upload-to-s3
description: Upload a local file to an S3 or S3-compatible bucket under a random UUID filename and copy the download URL to the clipboard. Use when the user asks to upload, share, or host a file, screenshot, image, or other artifact and wants a URL back.
user-invocable: true
argument-hint: "File path to upload"
source: https://github.com/limxingzhi/raycast-image-uploader
---

# Upload to S3

Uploads a file to an S3-compatible bucket and copies its download URL to the clipboard. The object is stored as `<uuid>.<ext>` using a random UUID, so the original filename does not leak into the bucket.

## Configuration

Set these in `~/start.sh` so they survive container restarts, or pass them to `docker run` with `-e`.

| Variable | Required | Purpose |
|---|---|---|
| `S3_ENDPOINT` | yes | Endpoint URL, e.g. `https://s3.example.com` or `http://100.x.x.x:9000` |
| `S3_BUCKET` | yes | Target bucket |
| `S3_ACCESS_KEY_ID` | yes | Access key |
| `S3_SECRET_ACCESS_KEY` | yes | Secret key |
| `S3_REGION` | no | Signing region, default `us-east-1` |

Example `~/start.sh`:

```sh
export S3_ENDPOINT="https://s3.example.com"
export S3_BUCKET="uploads"
export S3_ACCESS_KEY_ID="..."
export S3_SECRET_ACCESS_KEY="..."
```

## Procedure

1. Verify the file exists. Pass the path exactly as the user gave it.

2. Run the bundled script:

   ```sh
   ~/.config/agents/skills/upload-to-s3/upload-to-s3.sh <file>
   ```

   From a repo checkout, use `skills/upload-to-s3/upload-to-s3.sh <file>`.

3. The script prints the download URL to stdout and upload progress to stderr. Report the URL to the user. If it warns that the clipboard was unreachable, the upload still succeeded; give the user the URL.

## How it works

- **Upload**: `curl --aws-sigv4 aws:amz:<region>:s3 --user <key>:<secret> -T <file>` sends the object to `S3_ENDPOINT/S3_BUCKET/<uuid>.<ext>`. Path-style URLs are used, matching self-hosted S3 services.
- **UUID**: `node -e 'crypto.randomUUID()'`, available because telescreen ships Node.js.
- **Extension**: the original extension when present, otherwise `file --extension -b`, falling back to `bin`.
- **Content type**: `file --mime-type -b` sets the `Content-Type` header so images and text render in a browser.
- **Clipboard**: tmux `load-buffer -w` or OSC 52 on `/dev/tty`. Telescreen's tmux already enables `set-clipboard`.

## Requirements and security

- The bucket must allow anonymous `s3:GetObject` for the URL to work. Otherwise the upload succeeds but the link returns `403`.
- Scope the access key to `s3:PutObject` on this bucket only.
- Prefer HTTPS. With an `http://` endpoint, credentials and file contents travel in plaintext.
- Never print `S3_SECRET_ACCESS_KEY` in output.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `error: S3_ENDPOINT is not set` | Set the variables in `~/start.sh` or with `docker run -e` |
| `HTTP 403` on upload | Check credentials, region, and that the endpoint expects path-style URLs |
| Upload succeeds, URL is `403`/`404` | The object is not publicly readable; add a bucket policy |
| `could not reach the clipboard` | The terminal does not support OSC 52 and tmux is unavailable; use the printed URL |
| `--aws-sigv4` error | The installed curl is too old; telescreen's Debian bookworm curl supports it |
