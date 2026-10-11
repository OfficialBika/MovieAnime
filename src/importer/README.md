# Historical importer

The importer uses a separate GramJS Telegram user session to read history from channels the account can access and is authorized to index. It indexes metadata and source message IDs only; it does not download media.

Before use:
1. Configure `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, and `TELEGRAM_USER_SESSION`.
2. Provision and verify the user session interactively in a controlled environment. Never commit a session string or put it in logs.
3. Register the channel in MongoDB and ensure the session account can access it.
4. Start with one test channel and verify the import counts before scaling.

Run with:
`npm run dev:importer -- <registered-telegram-channel-id>`

The current implementation is an initial scanner, not yet verified against a live Telegram account. Review GramJS's current history pagination behavior and add integration tests against an authorized test channel before production rollout.