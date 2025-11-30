# LANvas

An r/place like web app for realtime collaborative editing of a pixel canvas. Initially developed in 12 hours with Next.js, WebSockets (with Socket.io), Tailwind, and PostgreSQL.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Firstly, get Postgres running, create the `lanvas` user and import `lanvas.sql` into your database.

Next, copy `.env.template` to `.env` and fill out the values as described in the file.

Then you can run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deployment

```bash
npm run build
```

```bash
npm start
```

## Wishlist

- Support mobile properly, including sizing, breakpoints, and proper use of react-zoom-pan-pinch without conflicting with tapping to draw
- Improve stability by dealing with conflicting edits safely
- Option to autoscale the timer based on number of connected users
