var api = require('../config/api.js');

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
function request(url, data = {}, method = "GET") {
  return new Promise(function (resolve, reject) {
    wx.request({
      url,
      data,
      method,
      header: {
        'Content-Type': 'application/json',
        'token': wx.getStorageSync('token')
      },
      success: function (res) {
        if (res.statusCode == 200) {
          if (res.data.code == 503002) {
            wx.navigateTo({
              url: '/pages/login/login'
            });
          } else if (res.data.code == 503003) {
            getNewToken().then(() => {
              request(url, data, method).then((res) => {
                resolve(res);
              })
            })
          } else {
            resolve(res.data);
          }
        } else {
          reject(res.errMsg);
        }
      },
      fail: function (err) {
        reject(err)
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
      header: {
        'token': wx.getStorageSync('token')
      },
      success: function (res) {
        let data = JSON.parse(res.data);
        if (res.statusCode == 200) {
          if (data.code == 503002) {
            wx.navigateTo({
              url: '/pages/login/login'
            });
          } else if (data.code == 503003) {
            getNewToken().then(() => {
              uploadFile(url, filePath).then((res) => {
                resolve(res);
              })
            })
          } else {
            resolve(data);
          }
        } else {
          reject(res.errMsg);
        }
      },
      fail: function (err) {
        reject(err)
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
      return getUserInfo();
    }).then((userInfo) => {
      //登录远程服务器
      request(api.loginUrl, {
        code: code,
        encryptedData: userInfo.encryptedData,
        iv: userInfo.iv
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
  request,
  uploadFile,
  getNewToken,
  checkSession,
  login,
  getUserInfo,
  getUserProfile,
  loginNow,
}