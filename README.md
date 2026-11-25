# pinillafitness

A daily check-in at fitness.pinillaweb.org. Each day, tap Lift, or Stretch to run a timed stretch routine. A calendar shows every check-in, and if a day has none by 10 PM, the phone gets a push notification.

## Accounts

Each person logs in with a username and password and has their own check-ins, stretch times and reminders. Nobody sees anyone else's. Passwords are stored as scrypt hashes in `users.json`. To add a person or change a password, pipe the password into the script, then restart the app:

```sh
echo 'their password' | FITNESS_DATA=./data node src/add-user.ts <username>
```

## Check-ins

A day holds any of three activities: `lift`, `lower` (lower body stretch) and `upper` (upper body stretch). Lift checks in with one tap. Finishing a stretch routine checks in that routine, and ending one early asks whether to check in anyway. Tap any past day on the calendar to change it.

A past day with no check-in shows as missed, but only from the first check-in ever.

## Stretch routines

The stretches, their cues and which ones are timed per side are in `public/routines.js`. Each stretch starts with a 10-second get-ready countdown, and the second side of a one-sided stretch gets 5 seconds to switch. Holds default to 60 seconds and can be changed on the "Change stretch times" page.

The timer counts from timestamps, so it stays right if the phone stalls the page. The screen stays on during a routine where the browser allows it.

## Reminder

Each phone turns reminders on from the home page, which subscribes it to web push. A phone's reminders belong to whoever is logged in on it. Each phone also sends its time zone, so the reminder comes at 10 PM where the phone is. A phone that hasn't sent one follows the server's clock. The server checks every minute. Once it's past 10 PM on a phone, and its person has no check-in for that day, the phone gets one reminder. The push carries no data, and the service worker shows a fixed notification. Subscriptions the push service reports gone are dropped.

## Running

Node 24 runs the TypeScript directly. The app has no runtime dependencies. oxlint and Prettier are dev dependencies for formatting only.

```sh
npm start
npm test
npm run format
```

`npm install` also turns on a pre-commit hook, `.githooks/pre-commit`. It runs `npm run format`, stages the fixes in files you staged in full, and stops the commit if `npm run check-format` still fails.

| Variable       | Meaning                                                     |
| -------------- | ----------------------------------------------------------- |
| `FITNESS_DATA` | Data folder, default `./data`                               |
| `PORT`, `HOST` | Default `3400` on `127.0.0.1`                               |
| `PUSH_CONTACT` | The VAPID contact, default `https://fitness.pinillaweb.org` |

The data folder holds `users.json`, `secret` (signs login cookies), `push-key.json` (the VAPID key), `subscriptions.json` (each phone's push endpoint and whose it is) and `reminded.json` (the last reminder date per person). Each person's own data is in `accounts/<username>/`: `checkins.json`, `times.json` and `changes.jsonl`, a log of every check-in change.
