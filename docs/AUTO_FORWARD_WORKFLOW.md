# MTProto automatic media forwarding

The session account monitors configured source channels, forwards new video posts to the Bot's private DM, and the Bot copies them to the configured private destination channel with normalized Anime/Episode/Resolution captions.

## Configure a route

Send this command to the Bot from a Telegram admin whose numeric user ID is listed in \`ADMIN_USER_IDS\`:

\`/start -1002484587849 -1004421847808\`

The first ID is the source channel read by the authorized Telegram user session. The second ID is the destination private channel where the Bot posts copies. The Bot must be an administrator with permission to post to the destination; the session account must have access to the source.

Use \`/forwards\` to list active routes and \`/stopforward -1002484587849\` to disable one.

The first time a route is seen, the forwarder initializes a message-ID checkpoint at the current latest post and does not replay old posts. Later video posts are forwarded, including posts missed while the worker was temporarily offline. Existing historical imports remain a separate process.

## PM2

\`\`\`bash
npm install
npm test
npm run build
pm2 start npm --name movieanime-bot -- run start:bot
pm2 start npm --name movieanime-forwarder -- run start:forwarder
pm2 save
\`\`\`

Both processes must use the same \`.env\` and MongoDB database. The forwarder requires \`TELEGRAM_API_ID\`, \`TELEGRAM_API_HASH\`, and an authorized \`TELEGRAM_USER_SESSION\`; do not publish these values. On first setup for a session account, the worker sends \`/start\` to the Bot DM itself.

Video captions must contain recognizable Anime Name, Episode Number and Resolution. Messages with ambiguous metadata go to helper review rather than inventing values. Telegram protected-content restrictions are not bypassed. This needs live validation against an authorized test channel before production use.
