# Historical importer

The importer uses a separate teleproto MTProto user session (the maintained GramJS-compatible fork) to read history from channels the account can access and is authorized to index. It indexes metadata and source message IDs only; it does not download media.

Before use:
1. Configure `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, and `TELEGRAM_USER_SESSION`.
2. Provision the session interactively in a controlled environment, then store its session string securely. Never commit it or put it in logs.
3. Register the channel with the Bot and ensure the user account has access and authorization to index it.
4. Start with one authorized test channel and review the import counts before scaling.

Run with:
`npm run dev:importer -- <registered-telegram-channel-id>`

The `/startfw` session auto-forward worker is supervised inside the `movieanime-bot` process when all three MTProto settings are configured; do not run a second PM2 process for auto-forwarding. The standalone `npm run start:forwarder` script remains available for diagnosis, but it is not needed for the normal bot deployment.

This initial scanner has not yet been validated against a live channel. Test history pagination, restart/resume checkpoints, media-type classification, and Telegram rate limits with an authorized test channel before production use.