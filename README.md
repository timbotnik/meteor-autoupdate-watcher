# Autoupdate Watcher

This is an example NodeJS app that provides a pattern for watching a Meteor app for a Hot Code Push.

It is based on a DDP publication that is made available from the Meteor `autoupdate` package, [here](https://github.com/meteor/meteor/tree/devel/packages/autoupdate).

To run it, start up any Meteor app in development mode (localhost:3000).  Then:


```
git clone git@github.com:timbotnik/meteor-autoupdate-watcher.git
cd meteor-autoupdate-watcher
npm install
node watcher.js
```

Now, whenever you modify a client or server file, you should see console logging that indicates whenever a rerun should be triggered.

There are 2 places where we are checking for updates:

1. In the callback when the subscription becomes ready.
2. In the observe callback for `changed` messsages.
