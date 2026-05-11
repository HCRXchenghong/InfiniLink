var api = require('../config/api.js');

let socketTask = null;
let isOpen = false;
let isConnecting = false;
let heartbeatTimer = null;
let reconnectTimer = null;
let manualClose = false;
let connectPromise = null;

const listeners = {};

function logSocketIssue(type, detail) {
  try {
    console.error('[InfiniLink socket:' + type + ']', detail);
  } catch (err) {}
}

function warnSocketIssue(type, detail) {
  try {
    console.warn('[InfiniLink socket:' + type + ']', detail);
  } catch (err) {}
}

function emit(event, payload) {
  const eventListeners = listeners[event] || [];
  eventListeners.forEach((handler) => {
    try {
      handler(payload);
    } catch (err) {}
  });
}

function on(event, handler) {
  if (!listeners[event]) {
    listeners[event] = [];
  }
  listeners[event].push(handler);
}

function off(event, handler) {
  if (!listeners[event]) {
    return;
  }
  listeners[event] = listeners[event].filter((item) => item !== handler);
}

function clearTimers() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function startHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  heartbeatTimer = setInterval(function () {
    if (isOpen && socketTask) {
      socketTask.send({
        data: JSON.stringify({
          type: 'ping'
        })
      });
    }
  }, 20000);
}

function scheduleReconnect() {
  if (manualClose || reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    connect().catch(function () {
      scheduleReconnect();
    });
  }, 2500);
}

function connect() {
  if (isOpen || isConnecting) {
    return connectPromise || Promise.resolve(socketTask);
  }

  const token = wx.getStorageSync('token');
  if (!token) {
    warnSocketIssue('missing-token', {
      url: api.socketUrl
    });
    return Promise.reject(new Error('missing token'));
  }

  manualClose = false;
  isConnecting = true;

  connectPromise = new Promise(function (resolve, reject) {
    socketTask = wx.connectSocket({
      url: api.socketUrl + '?token=' + encodeURIComponent(token),
      header: {
        token: token
      }
    });

    socketTask.onOpen(function () {
      isConnecting = false;
      isOpen = true;
      startHeartbeat();
      connectPromise = null;
      emit('open');
      resolve(socketTask);
    });

    socketTask.onMessage(function (res) {
      let data = null;
      try {
        data = JSON.parse(res.data);
      } catch (err) {
        data = {
          type: 'raw',
          payload: res.data
        };
      }
      emit('message', data);
      if (data && data.type) {
        if (data.type === 'session.force_logout') {
          try {
            require('./util').enforceBanLogout(data.meta || {});
          } catch (err) {}
        }
        emit(data.type, data);
      }
    });

    socketTask.onClose(function (res) {
      isOpen = false;
      isConnecting = false;
      clearTimers();
      socketTask = null;
      connectPromise = null;
      emit('close', res);
      if (!manualClose && res && Number(res.code || 0) !== 1000) {
        warnSocketIssue('close', {
          url: api.socketUrl,
          code: res.code,
          reason: res.reason || ''
        });
      }
      scheduleReconnect();
    });

    socketTask.onError(function (err) {
      isConnecting = false;
      socketTask = null;
      connectPromise = null;
      logSocketIssue('error', {
        url: api.socketUrl,
        error: err && err.errMsg ? err.errMsg : err
      });
      emit('error', err);
      reject(err);
    });
  });

  return connectPromise;
}

function close() {
  manualClose = true;
  clearTimers();
  if (socketTask) {
    socketTask.close({});
  }
  socketTask = null;
  isOpen = false;
  isConnecting = false;
  connectPromise = null;
}

function send(payload) {
  return connect().then(function () {
    return new Promise(function (resolve, reject) {
      socketTask.send({
        data: JSON.stringify(payload),
        success: function () {
          resolve(true);
        },
        fail: function (err) {
          reject(err);
        }
      });
    });
  });
}

function sendChat(receiverId, content, image) {
  return send({
    type: 'chat.send',
    receiver_id: receiverId,
    chat_content: content || '',
    chat_image: image || ''
  });
}

function markChatRead(oid) {
  return send({
    type: 'chat.read',
    oid: oid
  });
}

function getState() {
  return {
    isOpen: isOpen,
    isConnecting: isConnecting
  };
}

module.exports = {
  connect,
  close,
  on,
  off,
  send,
  sendChat,
  markChatRead,
  getState
}
