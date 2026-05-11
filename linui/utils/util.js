function getCompatSystemInfo() {
  const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : {};
  const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : {};
  const appBaseInfo = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : {};
  return Object.assign({}, appBaseInfo, deviceInfo, windowInfo);
}

const promisic = function (api) {
  return function (options = {}) {
    return new Promise((resolve, reject) => {
      const payload = Object.assign(options, {
        success: function (res) {
          resolve(res);
        },
        fail: function (err) {
          reject(err);
        }
      });
      api(payload);
    });
  };
};

const px2rpx = function (value) {
  const systemInfo = getCompatSystemInfo();
  const screenWidth = systemInfo.screenWidth || systemInfo.windowWidth || 375;
  return 750 / screenWidth * value;
};

export { promisic, px2rpx };
