# KT SPORT Order Tracker Deploy

## Why this is needed

Links with `localhost` only work on the computer running the app. Customers can open the tracker 24/7 only after the app is deployed to an online server.

## Recommended hosting

Use a Node/Docker host with persistent storage:

- Render paid web service with persistent disk
- Railway with volume
- A VPS such as DigitalOcean/Linode

Free static hosting is not enough because this app needs a backend and stored order data.

## Render deploy notes

1. Create a GitHub repository and upload this folder.
2. In Render, create a new Blueprint from the repository.
3. Render reads `render.yaml`.
4. Keep the persistent disk mounted at `/data`.
5. After deploy, use the public URL, for example:

   `https://kt-sport-order-tracker.onrender.com/#/admin`

6. Customer links will become:

   `https://kt-sport-order-tracker.onrender.com/#/track/<token>`

## Local run

```sh
node server.js
```

Open:

```txt
http://localhost:5173/#/admin
```
