'use strict';

module.exports = {};

// Statuses
module.exports.STATUS_SUCCESS = 'success';
module.exports.STATUS_FAIL = 'error';
module.exports.STATUS_PENDING = 'pending';
module.exports.STATUS_RUNNING = 'running';

// Actions
module.exports.ACTION_FINISHED = 'finished';
module.exports.ACTION_RUNNING = 'running';
module.exports.ACTION_PENDING = 'pending';

// Context
module.exports.CONTEXT_SETUP = 'env';

// Eventbus build_events event types.
module.exports.BUILD_EVENT_REAPED = 'reaped';
module.exports.BUILD_EVENT_READY = 'ready';
module.exports.BUILD_EVENT_UPDATED = 'updated';
