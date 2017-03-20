# Dead Person's Switch

## Setup

1. Create an IFTTT applet using the Maker trigger with the event `dead-persons-switch`. [Here's an example.](https://github.com/ben-ng/dead-persons-switch/blob/master/sample-applet.png)
2. Go to your [IFTTT Maker Webhook Settings Page](https://ifttt.com/services/maker_webhooks/settings)
3. Take a note of your personal key at the end of your Maker URL: `https://maker.ifttt.com/use/[KEY]`
4. Right click and open this in a new tab: [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/ben-ng/dead-persons-switch)
5. Give your app a name (e.g. `Daisys Switch`)
6. Replace `[KEY]` at the end of the `WEBHOOK_URL` Config Variable with the personal key from step 3.
7. Click Deploy. Your IFTTT applet should be triggered ten seconds after the app starts up.
8. Customize the `TRIGGERS` environment variable on Heroku ([Settings > Config Vars](https://github.com/ben-ng/dead-persons-switch/blob/master/config-vars.png)) to your liking. It is documented [here](#triggers).

## Usage

### GET /

You can check the status of your triggers by providing your secret key.

```sh
curl https://dead-persons-switch.herokuapp.com/?key=[SECRET]
```

### POST /trigger/[TRIGGER_NAME]/with/key/[SECRET]

Make simple POST requests to keep your triggers alive.

```sh
curl -X POST https://dead-persons-switch.herokuapp.com/trigger/[TRIGGER_NAME]/with/key/[SECRET]
```

## Configuration

Configure the app using environment variables.

### SECRET

A secret key, so that other people can't meddle with your server.

#### Example

```
SECRET="eWym4aVqcx4DNov"
```

### PORT

What port should the server listen on?

#### Example

```
PORT="80"
```

### WEBHOOK_URL

What URL should the server POST to when a trigger fails to respond?

#### Example

You _must_ specify a protocol (e.g. `https`).

```
WEBHOOK_URL="https://my-doomsday-machine:888/kaboom"
```

### TRIGGERS

Each trigger follows this format:

```
TRIGGER_NAME:DELAY[MAX_NOTIFICATIONS:NOTIFICATION_INTERVAL]
```

* `TRIGGER_NAME` Valid chracters are a-z, A-Z, 0-9, and _
* `DELAY` After this many milliseconds of inactivity, start notifying the webhook
* `MAX_NOTIFICATIONS` How many times to notify the webhook while the trigger is inactive. Defaults to one.
* `NOTIFICATION_INTERVAL` How long to wait between each webhook notification.

Define multiple triggers by separating each definition with a comma.

#### Example

```
TRIGGERS="toaster:1000,fridge:60000:60:60000"
```

This defines two triggers:

1. **toaster** notifies the webhook _once_ if it is not triggered at least once a second
2. **fridge** notifies the webhook up to sixty times, once a minute, if it is not triggered at least once a minute

### HOSTNAME (Optional)

What hostname should the server bind to?

## Testing

To run automated tests, just `npm test`.

## License

Copyright (c) 2017 Ben Ng <me@benng.me>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
