# Bot UI foundation

Implemented in this stage:
- /start and the two entry buttons
- Channel-title catalog from MongoDB
- Episode pagination (20 per page, five buttons per row)
- Latest indexed episode shortcut
- Resolution choices are derived from indexed media
- Registered-channel live-post indexing hook

Not production complete yet:
- Admin channel registration command
- Media delivery and durable delete-job scheduling
- Importer service command-line and account session authorization
- Callback pagination/message editing UX polish

The media callback intentionally does not send media yet until the delivery service and deletion job are wired and tested.