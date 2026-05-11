/**
 * 获取系统信息
 */
class SystemInfo {
  static getCompatSystemInfo() {
    const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : {}
    const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : {}
    const appBaseInfo = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : {}
    return Object.assign({}, appBaseInfo, deviceInfo, windowInfo)
  }

  static fetchAllInfo() {
    const menuButton = wx.getMenuButtonBoundingClientRect()
    const systemInfo = this.getCompatSystemInfo()
    const statusBarHeight = systemInfo.statusBarHeight
    const headerHeight = (menuButton.top - systemInfo.statusBarHeight) * 2 + menuButton.height
    let data = {
      source: {
        menu: menuButton,
        system: systemInfo
      },
      statusBarHeight: statusBarHeight,
      headerHeight: headerHeight,
      headerRight: systemInfo.windowWidth - menuButton.left
    }
    wx.setStorageSync('SystemInfo', data)
    return data
  }
  static getInfo() {
    let storageInfoSync = wx.getStorageSync('SystemInfo')
    if (!storageInfoSync) {
      storageInfoSync = this.fetchAllInfo()
    }
    return storageInfoSync
  }
}
export default SystemInfo
