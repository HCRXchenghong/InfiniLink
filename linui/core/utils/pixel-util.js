function getCompatSystemInfo() {
  const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : {};
  const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : {};
  const appBaseInfo = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : {};
  return Object.assign({}, appBaseInfo, deviceInfo, windowInfo);
}

class PixelUtil {
  constructor(systemInfo) {
    this.systemInfo = systemInfo;
  }

  px2rpx(value) {
    return 750 / this.systemInfo.screenWidth * value;
  }

  rpx2px(value) {
    return value / 750 * this.systemInfo.screenWidth;
  }
}

const systemInfo = getCompatSystemInfo();
const pixelUtil = new PixelUtil({
  screenWidth: systemInfo.screenWidth || systemInfo.windowWidth || 375
});

export default pixelUtil;
