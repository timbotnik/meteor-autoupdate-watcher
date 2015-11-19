var DDPClient = require('ddp');
var process = require('process');
var _  =require('underscore');

var AutoupdateWatcher = function() {
  this._isConnected = false;
  this._currentVersions = {};
  this._subscriptionHandle = null;
  this._observer = null;
  this._lastRerun = 0;
  this._autoupdateCollection = {};
  this._ddpClient = null;
  this._debug = false;
};

AutoupdateWatcher.prototype._triggerRerun = function() {
  var self = this;
  var now = (new Date()).getTime();
  if (now - self._lastRerun > 1000)  {
    // debounce this since we always see multiple version records change around the same time
    // actually rerun here...
    self._lastRerun = now;
    console.log('**** TRIGGERING RERUN ****');
  }
};

AutoupdateWatcher.prototype._didUpdateVersion = function(doc) {
  var self = this;
  var versionType;
  var versionKey;
  if (doc._id.match(/version/) === null) {
    versionType = 'version-server';
    versionKey = '_id';
  } else {
    versionType = doc._id;
    versionKey = 'version';
  }
  var prevVersion = self._currentVersions[versionType];
  var newVersion = doc[versionKey];
  var isUpdated = prevVersion && prevVersion !== newVersion
  if (isUpdated && self._debug) {
    console.log('New ' + versionType + ': ' + newVersion);
  }
  self._currentVersions[versionType] = newVersion;
  return isUpdated;
}

AutoupdateWatcher.prototype._checkForUpdate = function() {
  var self = this;
  var observedAutoupdate = false;
  _.each(self._autoupdateCollection, function(doc) {
    if (!observedAutoupdate && self._didUpdateVersion(doc)) {
      observedAutoupdate = true;
    }
  });

  if (observedAutoupdate) {
    self._triggerRerun();
  }
}

AutoupdateWatcher.prototype.watch = function() {
  var self = this;
  self._ddpClient = new DDPClient({
    // All properties optional, defaults shown
    host : 'localhost',
    port : 3000,
    ssl: false,
    autoReconnect: true,
    autoReconnectTimer: 500,
    maintainCollections: true,
    ddpVersion: '1',
    useSockJs: true
  });

  /*
   * Observe the autoupdate collection.
   */
  var observer = self._ddpClient.observe('meteor_autoupdate_clientVersions');
  observer.added = function(id) {
    if (self._debug) {
      console.log('[ADDED] to ' + observer.name + ':  ' + id);
    }
  };
  observer.changed = function(id, oldFields, clearedFields, newFields) {
    if (self._debug) {
      console.log('[CHANGED] in ' + observer.name + ':  ' + id);
      console.log('[CHANGED] old field values: ', oldFields);
      console.log('[CHANGED] cleared fields: ', clearedFields);
      console.log('[CHANGED] new fields: ', newFields);
    }
    if (self._didUpdateVersion(self._autoupdateCollection[id])) {
      self._triggerRerun();
    }
  };
  observer.removed = function(id, oldValue) {
    if (self._debug) {
      console.log('[REMOVED] in ' + observer.name + ':  ' + id);
      console.log('[REMOVED] previous value: ', oldValue);
    }
  };
  self._observer = observer;

  /*
   * Connect to the Meteor Server
   */
  self._ddpClient.connect(function(error, wasReconnect) {
    // If autoReconnect is true, this callback will be invoked each time
    // a server connection is re-established
    if (error) {
      console.log('DDP connection error!', error);
      self._isConnected = false;
      return;
    }
    self._isConnected = true;

    if (wasReconnect) {
      console.log('Reconnected');
    } else {
      console.log('Connected');
    }

    // force a reset of 'maintained' collections
    self._ddpClient.collections = {};

    /*
     * Subscribe to the Meteor Autoupdate Collection
     */
    self._subscriptionHandle = self._ddpClient.subscribe('meteor_autoupdate_clientVersions', [],
      function () { // callback when the subscription is ready
        self._autoupdateCollection = self._ddpClient.collections.meteor_autoupdate_clientVersions;
        if (self._debug) {
          console.log('meteor_autoupdate_clientVersions ready:');
          console.log(self._autoupdateCollection);
        }
        self._checkForUpdate();
      }
    );
  });
};

AutoupdateWatcher.prototype.stop = function() {
  if (this._ddpClient && this._isConnected) {
    if (this._subscriptionHandle) {
      this._ddpClient.unsubscribe(this._subscriptionHandle);
    }
    if (this._observer) {
      this._observer.stop();
    }
    this._ddpClient.close();

    this._isConnected = false;
    this._currentVersions = {};
    this._subscriptionHandle = null;
    this._observer = null;
    this._lastRerun = 0;
    this._autoupdateCollection = {};
    this._ddpClient = null;
  }
};


console.log('Running...');
var watcher = new AutoupdateWatcher();
watcher.watch();

process.on('SIGINT', function() {
  console.log('Exiting...');
  watcher.stop();
  process.exit(0);
});
