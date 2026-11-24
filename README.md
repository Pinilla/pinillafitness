# pinillafitness

A daily check-in at fitness.pinillaweb.org. Each day, tap Lift, or Stretch to run a timed stretch routine. A calendar shows every check-in, and if a day has none by 10 PM, the phone gets a push notification.

## Check-ins

A day holds any of three activities: `lift`, `lower` (lower body stretch) and `upper` (upper body stretch). Lift checks in with one tap. Finishing a stretch routine checks in that routine, and ending one early asks whether to check in anyway. Tap any past day on the calendar to change it.

A past day with no check-in shows as missed, but only from the first check-in ever.

## Stretch routines

The stretches, their cues and which ones are timed per side are in `public/routines.js`. Each stretch starts with a 10-second get-ready countdown, and the second side of a one-sided stretch gets 5 seconds to switch. Holds default to 60 seconds and can be changed on the "Change stretch times" page.

The timer counts from timestamps, so it stays right if the phone stalls the page. The screen stays on during a routine where the browser allows it.

## Reminder

Each phone turns reminders on from the home page, which subscribes it to web push. The server checks every minute. After 10 PM server time, if today has no check-in and no reminder went out yet, it sends one to every subscribed phone. The push carries no data, and the service worker shows a fixed notification. Subscriptions the push service reports gone are dropped.

## Running

Node 24 runs the TypeScript directly, with no npm dependencies.

```sh
FITNESS_PIN=1234 npm start
npm test
```

| Variable | Meaning |
|---|---|
| `FITNESS_PIN` | Login PIN, 4 to 8 digits. Required |
| `FITNESS_DATA` | Data folder, default `./data` |
| `PORT`, `HOST` | Default `3400` on `127.0.0.1` |
| `PUSH_CONTACT` | The VAPID contact, default `https://fitness.pinillaweb.org` |

The data folder holds `checkins.json`, `times.json`, `subscriptions.json`, `reminded.json`, `changes.jsonl` (every check-in change), `push-key.json` (the VAPID key) and `secret` (signs the login cookie).
