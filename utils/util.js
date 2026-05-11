var api = require('../config/api.js');
const ACTIVITY_PING_INTERVAL_SECONDS = 120;
const ACTIVE_INTERACTION_GRACE_SECONDS = 45;
const ACTIVE_FLUSH_INTERVAL_SECONDS = 60;
const ACTIVE_MAX_FLUSH_SECONDS = 300;
let lastUsagePingAt = 0;
let activeWindowStartedAt = 0;
let lastInteractionAt = 0;
let pendingActiveSeconds = 0;
let lastActivityFlushAt = 0;

const LOCAL_MEDIA_ROOTS = {
  'http://127.0.0.1/assets/': '/backend/static/',
  'https://127.0.0.1/assets/': '/backend/static/',
  'http://localhost/assets/': '/backend/static/',
  'https://localhost/assets/': '/backend/static/',
  'http://127.0.0.1/uploads/': '/backend/storage/uploads/',
  'https://127.0.0.1/uploads/': '/backend/storage/uploads/',
  'http://localhost/uploads/': '/backend/storage/uploads/',
  'https://localhost/uploads/': '/backend/storage/uploads/'
};

const LEGACY_IMAGE_MAP = {
  'circles-rafiki.png': '/backend/static/illustrations/circles-rafiki.png',
  'social-media-rafiki.png': '/backend/static/illustrations/social-media-rafiki.png',
  'astronaut-rafiki.png': '/backend/static/illustrations/astronaut-rafiki.png',
  'outer-space-rafiki.png': '/backend/static/illustrations/outer-space-rafiki.png',
  'people-search-amico.png': '/backend/static/illustrations/people-search-amico.png',
  'no-data-cuate.png': '/backend/static/illustrations/no-data-cuate.png',
  'savings-cuate.png': '/backend/static/illustrations/savings-cuate.png',
  'messaging-fun-rafiki.png': '/backend/static/illustrations/messaging-fun-rafiki.png',
  'world-rafiki.png': '/backend/static/illustrations/world-rafiki.png',
  'plain-credit-card-cuate.png': '/backend/static/illustrations/plain-credit-card-cuate.png',
  'circle-avatar.svg': '/backend/static/illustrations/circles-rafiki.png',
  'circle-cover.svg': '/backend/static/illustrations/social-media-rafiki.png',
  'post-cover.svg': '/backend/static/illustrations/social-media-rafiki.png',
  'banner-default.svg': '/backend/static/illustrations/outer-space-rafiki.png',
  'avatar-default.svg': '/backend/static/avatar-default.svg',
  'profile-cover.svg': '/backend/static/illustrations/world-rafiki.png'
};

function buildLoginUserInfo(profile) {
  if (profile && typeof profile === 'object') {
    return {
      nickName: profile.nickName || profile.user_name || 'InfiniLink 用户',
      avatarUrl: profile.avatarUrl || profile.user_avatar || '',
      province: profile.province || '',
      city: profile.city || '',
      country: profile.country || '',
      gender: profile.gender || 0
    };
  }
  return {
    nickName: 'InfiniLink 用户',
    avatarUrl: '',
    province: '',
    city: '',
    country: '',
    gender: 0
  };
}

function normalizeMediaURL(value) {
  if (typeof value !== 'string') {
    return value;
  }

  if (/^https?:\/\/(127\.0\.0\.1|localhost)\/storage\/wxprogram\/image\//i.test(value)) {
    const filename = value.split('/').pop().toLowerCase();
    if (LEGACY_IMAGE_MAP[filename]) {
      return LEGACY_IMAGE_MAP[filename];
    }
  }

  for (const prefix in LOCAL_MEDIA_ROOTS) {
    if (value.indexOf(prefix) === 0) {
      const relativePath = value.slice(prefix.length);
      const mappedLegacyPath = LEGACY_IMAGE_MAP[relativePath.toLowerCase()];
      if (mappedLegacyPath) {
        return mappedLegacyPath;
      }
      return LOCAL_MEDIA_ROOTS[prefix] + relativePath;
    }
  }

  return value;
}

function normalizeResponseData(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeResponseData(item));
  }

  if (value && typeof value === 'object') {
    const normalized = {};
    for (const key in value) {
      normalized[key] = normalizeResponseData(value[key]);
    }
    return normalized;
  }

  return normalizeMediaURL(value);
}

function stringifyRequestData(data) {
  if (typeof data === 'undefined' || data === null) {
    return '';
  }
  if (typeof data === 'string') {
    return data;
  }
  try {
    const serialized = JSON.stringify(data);
    return serialized === '{}' ? '' : serialized;
  } catch (err) {
    return '[unserializable data]';
  }
}

function buildRequestError(url, data, method, reason, retryCount) {
  const requestMethod = String(method || 'GET').toUpperCase();
  const requestData = stringifyRequestData(data);
  const paramsText = requestData ? ' params=' + requestData : '';
  const baseMessage = '[' + requestMethod + ' ' + url + '] ' + reason;
  return {
    message: baseMessage + paramsText,
    detail: {
      url: url,
      method: requestMethod,
      data: data,
      reason: reason,
      retryCount: retryCount || 0
    }
  };
}

function logRequestIssue(type, payload) {
  try {
    console.error('[InfiniLink ' + type + ']', payload.message, payload.detail);
  } catch (err) {}
}

function warnRequestIssue(type, payload) {
  try {
    console.warn('[InfiniLink ' + type + ']', payload.message, payload.detail);
  } catch (err) {}
}

function navigateToLogin() {
  wx.reLaunch({
    url: '/pages/login/login'
  });
}

function normalizeBanInfo(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    reason: source.reason || source.ban_reason || '平台管理员已对该账号执行封禁',
    banned_at: source.banned_at || '',
  };
}

function enforceBanLogout(payload) {
  const banInfo = normalizeBanInfo(payload);
  wx.removeStorageSync('token');
  wx.removeStorageSync('userInfo');
  wx.setStorageSync('banInfo', banInfo);
  resetActivityTracking();
  try {
    require('./socket').close();
  } catch (err) {}
  navigateToLogin();
  return banInfo;
}

function resetActivityTracking() {
  lastUsagePingAt = 0;
  activeWindowStartedAt = 0;
  lastInteractionAt = 0;
  pendingActiveSeconds = 0;
  lastActivityFlushAt = 0;
}

function reportUserActivity(payload = {}) {
  const token = wx.getStorageSync('token');
  if (!token || !api.userActivityPingUrl) {
    return;
  }
  wx.request({
    url: api.userActivityPingUrl,
    method: 'POST',
    timeout: 5000,
    data: {
      online_seconds: Number(payload.online_seconds || 0),
      active_seconds: Number(payload.active_seconds || 0),
      source: payload.source || 'app'
    },
    header: {
      'Content-Type': 'application/json',
      'token': token
    }
  });
}

function maybeReportActiveUsage(url) {
  if (!wx.getStorageSync('token') || url === api.userActivityPingUrl) {
    return;
  }
  recordUserInteraction('api');
  const now = Date.now();
  if (!lastUsagePingAt) {
    lastUsagePingAt = now;
    return;
  }
  const elapsedSeconds = Math.floor((now - lastUsagePingAt) / 1000);
  if (elapsedSeconds < ACTIVITY_PING_INTERVAL_SECONDS) {
    return;
  }
  lastUsagePingAt = now;
  flushTrackedActiveUsage('api', false);
}

function recordUserInteraction(source = 'interaction') {
  if (!wx.getStorageSync('token')) {
    resetActivityTracking();
    return;
  }

  const now = Date.now();
  if (!activeWindowStartedAt) {
    activeWindowStartedAt = now;
  } else if (lastInteractionAt > 0) {
    const idleSeconds = Math.floor((now - lastInteractionAt) / 1000);
    if (idleSeconds > ACTIVE_INTERACTION_GRACE_SECONDS) {
      pendingActiveSeconds += Math.max(0, Math.floor((lastInteractionAt - activeWindowStartedAt) / 1000));
      activeWindowStartedAt = now;
    }
  }
  lastInteractionAt = now;
  if (!lastActivityFlushAt) {
    lastActivityFlushAt = now;
  }
  flushTrackedActiveUsage(source, false);
}

function flushTrackedActiveUsage(source = 'interaction', force = false) {
  if (!wx.getStorageSync('token')) {
    resetActivityTracking();
    return;
  }

  const now = Date.now();
  const elapsedSinceFlush = lastActivityFlushAt ? Math.floor((now - lastActivityFlushAt) / 1000) : ACTIVE_FLUSH_INTERVAL_SECONDS;
  if (activeWindowStartedAt > 0 && lastInteractionAt > 0) {
    const idleSeconds = Math.floor((now - lastInteractionAt) / 1000);
    if (idleSeconds > ACTIVE_INTERACTION_GRACE_SECONDS) {
      pendingActiveSeconds += Math.max(0, Math.floor((lastInteractionAt - activeWindowStartedAt) / 1000));
      activeWindowStartedAt = 0;
      lastInteractionAt = 0;
    }
  }

  let currentWindowSeconds = 0;
  if (activeWindowStartedAt > 0) {
    currentWindowSeconds = Math.max(0, Math.floor((now - activeWindowStartedAt) / 1000));
  }
  const totalActiveSeconds = pendingActiveSeconds + currentWindowSeconds;
  if (!force && totalActiveSeconds < ACTIVE_FLUSH_INTERVAL_SECONDS && elapsedSinceFlush < ACTIVE_FLUSH_INTERVAL_SECONDS) {
    return;
  }

  const activeSeconds = Math.min(Math.floor(totalActiveSeconds), ACTIVE_MAX_FLUSH_SECONDS);
  if (activeSeconds <= 0) {
    lastActivityFlushAt = now;
    return;
  }

  let remainingToConsume = activeSeconds;
  if (pendingActiveSeconds >= remainingToConsume) {
    pendingActiveSeconds -= remainingToConsume;
    remainingToConsume = 0;
  } else {
    remainingToConsume -= pendingActiveSeconds;
    pendingActiveSeconds = 0;
  }
  if (remainingToConsume > 0 && activeWindowStartedAt > 0) {
    activeWindowStartedAt += remainingToConsume * 1000;
    if (activeWindowStartedAt > now) {
      activeWindowStartedAt = now;
    }
  }
  lastActivityFlushAt = now;
  reportUserActivity({
    active_seconds: activeSeconds,
    source: source
  });
}

/**
 * 获取用户地址
 */
const checkPermission = function (t, e, n) {
  wx.getSetting({
    success: function (a) {
      i(a), null == a.authSetting[t] ? wx.authorize({
        scope: t,
        success: function () {
          i("checkPermission => success"), n();
        },
        fail: function () {
          i("checkPermission => fail");
        }
      }) : a.authSetting[t] ? n() : (i("checkPermission => 提示需要授权"), wx.showModal({
        title: "提示",
        content: e,
        success: function (t) {
          t.confirm ? (i("checkPermission => 用户点击确定"), wx.openSetting({})) : t.cancel && i("checkPermission => 用户点击取消");
        }
      }));
    }
  });
}

/**
 * 微信的的request
 */
function request(url, data = {}, method = "GET", retryCount = 0) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url,
      data,
      method,
      timeout: 30000,
      header: {
        'Content-Type': 'application/json',
        'token': wx.getStorageSync('token')
      },
      success: function (res) {
        if (res.statusCode == 200) {
          if (res.data.code == 503002) {
            navigateToLogin();
            reject({
              code: 503002,
              message: res.data.message || '请先登录'
            });
            return;
          } else if (res.data.code == 503003) {
            getNewToken().then(() => {
              request(url, data, method).then((res) => {
                resolve(res);
              }).catch(reject)
            }).catch(reject)
            return;
          } else if (res.data.code == 503004) {
            const banInfo = enforceBanLogout(res.data.data || {});
            reject({
              code: 503004,
              message: res.data.message || '您已被封禁',
              data: banInfo
            });
            return;
          } else {
            maybeReportActiveUsage(url);
            resolve(normalizeResponseData(res.data));
            return;
          }
        } else {
          const requestError = buildRequestError(
            url,
            data,
            method,
            res.errMsg || ('request:fail status code ' + res.statusCode),
            retryCount
          );
          logRequestIssue('request status error', requestError);
          reject(requestError.message);
        }
      },
      fail: function (err) {
        const errMsg = err && err.errMsg ? err.errMsg : err;
        const requestError = buildRequestError(
          url,
          data,
          method,
          errMsg || 'request:fail',
          retryCount
        );
        if (String(method).toUpperCase() === 'GET' && retryCount < 1 && /timeout/i.test(String(errMsg || ''))) {
          warnRequestIssue('request retry', requestError);
          resolve(request(url, data, method, retryCount + 1));
          return;
        }
        logRequestIssue('request fail', requestError);
        reject(requestError.message)
      }
    })
  });
}


/**
 * 微信的上传uploadFile
 */
function uploadFile(url, filePath) {
  return new Promise(function (resolve, reject) {
    wx.uploadFile({
      url: url,
      filePath: filePath,
      name: 'file',
      timeout: 30000,
      header: {
        'token': wx.getStorageSync('token')
      },
      success: function (res) {
        let data = JSON.parse(res.data);
        if (res.statusCode == 200) {
          if (data.code == 503002) {
            navigateToLogin();
            reject({
              code: 503002,
              message: data.message || '请先登录'
            });
            return;
          } else if (data.code == 503003) {
            getNewToken().then(() => {
              uploadFile(url, filePath).then((res) => {
                resolve(res);
              }).catch(reject)
            }).catch(reject)
            return;
          } else if (data.code == 503004) {
            const banInfo = enforceBanLogout(data.data || {});
            reject({
              code: 503004,
              message: data.message || '您已被封禁',
              data: banInfo
            });
            return;
          } else {
            resolve(normalizeResponseData(data));
            return;
          }
        } else {
          const uploadError = buildRequestError(
            url,
            {
              filePath: filePath
            },
            'UPLOAD',
            res.errMsg || ('upload:fail status code ' + res.statusCode),
            0
          );
          logRequestIssue('upload status error', uploadError);
          reject(uploadError.message);
        }
      },
      fail: function (err) {
        const uploadError = buildRequestError(
          url,
          {
            filePath: filePath
          },
          'UPLOAD',
          err && err.errMsg ? err.errMsg : err,
          0
        );
        logRequestIssue('upload fail', uploadError);
        reject(uploadError.message)
      }
    })
  });
}

/**
 * 更新token
 */
function getNewToken() {
  let code = null;
  return new Promise((resolve, reject) => {
    return login().then((res) => {
      code = res.code;
      const userInfo = buildLoginUserInfo(wx.getStorageSync('userInfo'));
      request(api.loginUrl, {
        code: code,
        userInfo: userInfo
      }, 'POST').then(res => {
        if (res.code === 200) {
          wx.setStorageSync('token', res.data.token);
          resolve(res);
        } else {
          reject(res);
        }
      }).catch((err) => {
        reject(err);
      });
    }).catch((err) => {
      reject(err);
    })
  });
}

/**
 * 检查微信会话是否过期
 */
function checkSession() {
  return new Promise(function (resolve, reject) {
    wx.checkSession({
      success: function () {
        resolve(true);
      },
      fail: function () {
        reject(false);
      }
    })
  });
}

/**
 * 调用微信登录
 */
function login() {
  return new Promise(function (resolve, reject) {
    wx.login({
      success: function (res) {
        if (res.code) {
          //登录远程服务器
          resolve(res);
        } else {
          reject(res);
        }
      },
      fail: function (err) {
        reject(err);
      }
    });
  });
}

function getUserProfile() {
  return new Promise(function (resolve, reject) {
    wx.getUserProfile({
      desc: '用于完善您的基本资料', // 声明获取用户个人信息后的用途，后续会展示在弹窗中，请谨慎填写
      success: (res) => {
        resolve(res);
      },
      fail: function (err) {
        reject(err);
      }
    })
  });
}

function getUserInfo() {
  return new Promise(function (resolve, reject) {
    wx.getUserInfo({
      withCredentials: true,
      success: function (res) {
        resolve(res);
      },
      fail: function (err) {
        reject(err);
      }
    })
  });
}

/**
 * 判断页面是否需要登录
 */
function loginNow() {
  let userInfo = wx.getStorageSync('userInfo');
  if (userInfo == '') {
    wx.navigateTo({
      url: '/pages/login/login'
    });
    return false;
  } else {
    return true;
  }
}

module.exports = {
  checkPermission,
  enforceBanLogout,
  reportUserActivity,
  recordUserInteraction,
  flushTrackedActiveUsage,
  request,
  uploadFile,
  getNewToken,
  checkSession,
  login,
  getUserInfo,
  getUserProfile,
  loginNow,
}
