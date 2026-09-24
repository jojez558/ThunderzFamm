# Thunderz Family — Full Stack Site

Urban dance crew website with a real backend: merch cart + Paystack checkout,
a booking/contact form that saves inquiries and emails you, and an admin
panel to edit crew, shows, and merch without touching code.

## Stack

- **Backend:** Node.js + Express
- **Data storage:** MongoDB when `MONGODB_URI` is configured, with the local
  JSON file (`data/db.json`) as a fallback for development. On first MongoDB
  startup, the existing JSON data is imported automatically.
- **Payments:** Paystack Kenya (M-PESA, cards, and other supported methods)
- **Email:** any SMTP provider, via Nodemailer
- **Frontend:** plain HTML/CSS/JS, no build step, no framework

## 1. Install

```bash
cd motion-tribe
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable                                              | What it's for                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `SESSION_SECRET`                                      | Any long random string — signs the admin login cookie                              |
| `MONGODB_URI` / `MONGODB_DB_NAME`                     | Optional MongoDB connection and database name; leave `MONGODB_URI` blank for JSON |
| `PAYSTACK_SECRET_KEY`                                 | From your Paystack Dashboard developer settings. Use the test key while developing |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Your email provider's SMTP credentials                                             |
| `NOTIFY_EMAIL`                                        | Where booking/contact form notifications get sent                                  |

You can run the site without Paystack or SMTP configured — checkout will
show a friendly error until Paystack is set up, and booking submissions
will just log to your terminal instead of emailing, so you can build and
test everything else first.

To use MongoDB, set these values in `.env`:

```dotenv
MONGODB_URI=mongodb+srv://username:password@cluster.example.mongodb.net/
MONGODB_DB_NAME=thunderz_family
```

The server stores the site's products, crew, shows, bookings, orders, and
admin settings in one `site_state` document. Do not commit `.env` because it
contains database credentials.

## 3. Run it

```bash
npm start
```

Then open:

- **Site:** http://localhost:4000
- **Admin panel:** http://localhost:4000/admin.html

**Default admin password is `changeme123`.** Log in, go to the
**Settings** tab, and change it immediately — this is a self-hosted
site with no other user accounts, so that password is the only thing
protecting your content and booking data.

Use `npm run dev` instead of `npm start` while you're actively editing
server code — it restarts automatically on save (via nodemon).

## 4. Turn on real payments

The checkout flow works with just `PAYSTACK_SECRET_KEY` set — it will create
a Paystack transaction and redirect customers to pay in KES.

For orders to show up in the **Orders** tab of the admin panel, Paystack
needs to notify your server when a payment completes:

1. Add a webhook endpoint in the Paystack Dashboard once you're deployed publicly, pointing at:
   ```
   https://your-domain.com/api/checkout/webhook
   ```
2. Paystack signs webhook requests with `PAYSTACK_SECRET_KEY`; no separate webhook secret is needed.

Without the webhook configured, payments still go through on Paystack's
side — you just won't see them logged in your Orders tab, so set this
up before you rely on it for real sales.

## 5. Deploying

This app is a single Node process serving both the API and the static
frontend — it'll run on any host that runs Node (a VPS, Render, Railway,
Fly.io, a Raspberry Pi, etc.). A few things to do before going live:

- Set `NODE_ENV=production` so session cookies require HTTPS.
- Put a real domain in `CLIENT_URL` (used to build Paystack callback URLs).
- Switch `PAYSTACK_SECRET_KEY` to your live key only once you're ready to take real money.
- Back up `data/db.json` periodically — it's your entire database.
- Run it behind a process manager (`pm2`, systemd, or your host's equivalent) so it restarts if it crashes.

## Project structure

```
motion-tribe/
├── server/
│   ├── index.js          # app entrypoint — wires everything together
│   ├── db.js              # JSON file "database"
│   ├── mailer.js           # SMTP email sending
│   ├── middleware/adminAuth.js
│   └── routes/
│       ├── public.js       # GET products / crew / shows
│       ├── bookings.js     # POST booking/contact inquiries
│       ├── paystack.js     # Paystack transaction + webhook
│       └── admin.js        # login + CRUD for everything
├── public/
│   ├── index.html          # main site (fetches content from the API)
│   ├── admin.html          # admin dashboard
│   ├── css/
│   └── js/
├── data/db.json             # auto-created — your actual content + orders live here
├── .env.example
└── package.json
```

## Editing content without the admin panel

Everything the admin panel edits (`products`, `crew`, `shows`) lives in
`data/db.json`. You can hand-edit that file directly while the server is
stopped if you'd rather not use the UI — just keep the JSON valid.
