# LANvas

An r/place like web app for realtime collaborative editing of a pixel canvas. Initially developed in 12 hours with Next.js, WebSockets (with Socket.io), Tailwind, and PostgreSQL.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Firstly, get Postgres running, create the `lanvas` user and import `lanvas.sql` into your database.

Next, copy `.env.template` to `.env` and fill out the values as described in the file.

Now install the dependencies:

```bash
npm install
```

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

## Timelapse generation

To generate a timelapse video of the canvas history, run the following command:

```bash
npm run timelapse
```

This will create timelapses, both with and without an overlaid timestamp, in the `timelapses` folder as .webm files.

You need [ffmpeg](https://ffmpeg.org/) installed and available in your PATH for this to work, and it must be compiled with libvpx support.

If you don't have the right version of ffmpeg installed, the script will still output the image sequences and concat lists, allowing you to manually create the video later.

## About automod

The automod system for comments uses a local AI model, [toxic-bert](https://huggingface.co/Xenova/toxic-bert) for classification of extreme and toxic messages. This model is only ever ran on the server.

This feature can be configured from the admin page to turn it on or off on the fly.

Regardless of this config setting, LANvas will attempt to download the model on server startup to ensure it is available when needed.

If you wish to completely disable this, which will not allow you to toggle it during runtime, the `@huggingface/transformers` dependency is optional, so you can use `npm install --no-optional` to skip installing it in the first place.

## Wishlist

- Support mobile properly, including sizing, breakpoints, and proper use of react-zoom-pan-pinch without conflicting with tapping to draw
- Improve stability by dealing with conflicting edits safely
- Option to autoscale the timer based on number of connected users
