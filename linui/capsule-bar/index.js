import deviceUtil from "../utils/device-util";
import validator from "../behaviors/validator";
import eventUtil from "../core/utils/event-util";

function getCompatSystemInfo() {
  const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : {};
  const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : {};
  const appBaseInfo = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : {};
  return Object.assign({}, appBaseInfo, deviceInfo, windowInfo);
}

Component({
  behaviors: [validator],
  externalClasses: ["l-title-class"],
  properties: {
    bgColor: { type: String, value: "white" },
    statusBarColor: { type: String, value: "transparent" },
    titleBarColor: { type: String, value: "transparent" },
    titleColor: { type: String, value: "black" },
    capsuleColor: { type: String, value: "black", options: ["white", "black"] },
    disableBack: { type: Boolean, value: false },
    disableHome: { type: Boolean, value: false },
    hiddenCapsule: { type: Boolean, value: false },
    homePage: { type: String, value: "" },
    title: { type: String, value: "" },
    hasPadding: { type: Boolean, value: true }
  },
  data: {
    titleBarHeight: deviceUtil.getTitleBarHeight(),
    statusBarHeight: deviceUtil.getStatusBarHeight(),
    capsuleButtonInfo: null
  },
  lifetimes: {
    ready: function () {
      this.setData({
        capsuleButtonInfo: this.getCapsuleButtonInfo()
      });
    }
  },
  methods: {
    getCapsuleButtonInfo() {
      const systemInfo = getCompatSystemInfo();
      const screenWidth = systemInfo.screenWidth || systemInfo.windowWidth || 375;
      const capsule = wx.getMenuButtonBoundingClientRect();
      capsule.left = screenWidth - capsule.right;
      capsule.right = capsule.left + capsule.width;
      return capsule;
    },
    onTapLeftButton() {
      eventUtil.emit(this, "linlefttap");
      if (!this.data.disableBack) {
        wx.navigateBack();
      }
    },
    onLongPressLeftButton() {
      eventUtil.emit(this, "linleftlongpress");
    },
    async onTapRightButton() {
      eventUtil.emit(this, "linrighttap");
      const homePage = this.data.homePage;
      if (!this.data.disableHome) {
        wx.switchTab({
          url: homePage,
          fail() {
            wx.navigateTo({
              url: homePage
            });
          }
        });
      }
    },
    onLongPressRightButton() {
      eventUtil.emit(this, "linrightlongpress");
    }
  }
});
