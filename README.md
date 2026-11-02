# OurLens

OurLens gathers the photos, videos, and messages guests contribute at an event into one shared collection.

## Development

Configure `.env` from `.env.example`, start PostgreSQL with `docker compose up -d`, apply checked-in migrations, and generate the Prisma Client:

```bash
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Organizers set an event start/end date and time in an IANA time zone when creating an event, and can update the schedule from the event dashboard. Guest contributions are accepted only from the scheduled start (inclusive) until the scheduled end (exclusive). Existing events without a valid schedule remain closed to uploads until an organizer sets one.

Guest photo uploads support JPEG, PNG, and WebP up to 8 MB. Video uploads support MP4 and MOV up to 100 MB, subject to the package's verified duration limit. HEIC, WebM, and in-app video recording are not supported. Guest uploads remain pending until an organizer approves them.

## Organizer orders and payments

Creating an event creates a pending order and keeps the event in `DRAFT`. The package price and benefits are snapshotted on the order. The event becomes available only after the server verifies a Midtrans notification and confirms the current transaction status with Midtrans; the event's saved schedule still determines when guest contributions open.

Configure these server-only variables to enable Midtrans Sandbox checkout:

```env
MIDTRANS_SERVER_KEY=your-sandbox-server-key
MIDTRANS_ENVIRONMENT=sandbox
NEXT_PUBLIC_APP_URL=https://your-public-https-host
```

Set the Midtrans payment notification URL to `https://your-public-https-host/api/payments/midtrans/webhook`. Do not use the organizer return URL as payment confirmation. Production credentials and `MIDTRANS_ENVIRONMENT=production` are only for a separately configured production deployment.

Package prices and benefits are read from the `Package` database records. A zero price means “not configured”, not a free package; configure the official IDR prices before accepting paid orders. No package price is supplied by the development seed.

Run `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npx prisma validate`, and `npm run build` for validation. PostgreSQL integration tests run when `DATABASE_URL` is configured.
