function getCompatSystemInfo() {
  const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : {};
  const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : {};
  const appBaseInfo = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : {};
  return Object.assign({}, appBaseInfo, deviceInfo, windowInfo);
}

class DeviceUtil {
  constructor(systemInfo) {
    this.systemInfo = systemInfo;
  }

  px2rpx(value) {
    return 750 / this.systemInfo.windowWidth * value;
  }

  rpx2px(value) {
    return this.systemInfo.windowWidth / 750 * value;
  }

  getNavigationBarHeight() {
    return this.getTitleBarHeight() + this.getStatusBarHeight();
  }

  getStatusBarHeight() {
    return this.px2rpx(this.systemInfo.statusBarHeight || 0);
  }

  getTitleBarHeight() {
    const statusBarHeight = this.systemInfo.statusBarHeight || 0;
    const capsule = wx.getMenuButtonBoundingClientRect();
    const gap = capsule.top - statusBarHeight;
    return this.px2rpx(2 * gap + capsule.height);
  }
}

const deviceUtil = new DeviceUtil(getCompatSystemInfo());

export default deviceUtil;
