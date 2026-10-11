# Helper inbox and private-channel routing

This feature lets a registered helper submit video posts to the bot in a **private chat**. The bot parses the caption, resolves the Anime route, copies the video to the configured private channel with a normalized caption, and indexes the copied message as the Episode + Resolution source used by the catalog.

## Admin setup

1. Add the bot as an administrator in each destination private channel and grant **Post Messages**.
2. Register the helper user's numeric Telegram ID with /addhelper 123456789.
3. Register an Anime route with /addroute Anime Name | -1001234567890.
4. Check the lists using /helpers and /routes.

A route's Anime Name should match the title detected from the submitted caption. /removeroute Anime Name disables that route and hides its catalog entry; it does not erase stored episode records. /removehelper USER_ID disables a helper.

## Helper submission

The helper sends the video directly to the bot in a private chat. A video document is accepted only when Telegram reports a video/* MIME type. Put the Anime title, episode number, and resolution in the caption. Examples:

- Tales Of Herding God (104) 1080P
- Renegade Immortal followed by Episode 103 and 720P on separate lines.

The bot does not guess a missing resolution. Unparseable posts and submissions without a configured route are recorded in helper_review_items and the bot tells the helper what needs attention. Successful copies are recorded in helper_submissions; Episode and Media indexes point to the copied message in the destination channel, so the user-facing catalog can deliver that indexed message later.

## Safety and operational notes

- Only IDs configured as admins or active helpers can submit videos.
- The bot rejects group submissions and non-video documents.
- Telegram copying and MongoDB writes are not a distributed transaction. The service attempts to delete a copied channel post if indexing fails; check logs if that rollback also fails.
- A live authorized Telegram channel test is still required for bot admin permissions, Telegram API limits, real caption formats, and end-to-end catalog delivery.
