function getCompatSystemInfo() {
  const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : {};
  const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : {};
  const appBaseInfo = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : {};
  return Object.assign({}, appBaseInfo, deviceInfo, windowInfo);
}

export default Behavior({
  behaviors: [],
  properties: {},
  data: {
    distance: 0
  },
  attached() {
    this.offsetMargin();
  },
  methods: {
    offsetMargin() {
      const systemInfo = getCompatSystemInfo();
      const windowHeight = systemInfo.windowHeight || 0;
      const screenHeight = systemInfo.screenHeight || windowHeight;
      this.setData({
        distance: screenHeight - windowHeight
      });
    }
  }
});
