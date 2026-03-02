---
name: send-email-gog
description: Instructions on how to send an email using the gog CLI command securely with .env credentials
---

# Send Email Using Gog CLI

When sending an email using the `gog` CLI within the NanoClaw project, you MUST source the credentials from the `.env` file first. Otherwise, the command will hang indefinitely waiting for an interactive password prompt.

## Prerequisites
- The `.env` file (`/home/gabriel/prj/nanoclaw/.env`) contains the required environment variables:
  - `GOG_KEYRING_BACKEND=file`
  - `GOG_KEYRING_PASSWORD=<password>`
  - `GOG_ACCOUNT=<email-address>`

## Steps to send an email

1. You can safely auto-run the email command by passing the variables inline or sourcing `.env`.

Example command to send a simple text email:
```bash
source /home/gabriel/prj/nanoclaw/.env
export GOG_KEYRING_BACKEND GOG_KEYRING_PASSWORD GOG_ACCOUNT
gog gmail send \
  --account "$GOG_ACCOUNT" \
  --to "recipient@example.com" \
  --subject "Your Subject Here" \
  --body "Your text body here"
```

Example command to send an HTML email using a file:
```bash
source /home/gabriel/prj/nanoclaw/.env
export GOG_KEYRING_BACKEND GOG_KEYRING_PASSWORD GOG_ACCOUNT
gog gmail send \
  --account "$GOG_ACCOUNT" \
  --to "recipient@example.com" \
  --subject "Your Subject Here" \
  --body "Please use an HTML-capable client." \
  --body-html "$(cat /path/to/mail_content.html)"
```

ALWAYS use this method to avoid any interactive keychain password prompts.
