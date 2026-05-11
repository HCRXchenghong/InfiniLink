const util = require('./utils/util')

function getCompatSystemInfo() {
  const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : {};
  const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : {};
  const appBaseInfo = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : {};
  return Object.assign({}, appBaseInfo, deviceInfo, windowInfo);
}

App({
  onLaunch: function (options) {
    const updateManager = wx.getUpdateManager();
    updateManager.onUpdateReady(function () {
      wx.showModal({
        title: '更新提示',
        content: '全新的「InfiniLink」已经准备好，请更新重启',
        showCancel: false,
        success: function (res) {
          if (res.confirm) {
            // 新的版本已经下载好，调用 applyUpdate 应用新版本并重启
            updateManager.applyUpdate()
          }
        }
      })
    })
    var that = this;
    const res = getCompatSystemInfo();
    const model = res.model || '';
    const system = (res.system || '').toLowerCase();
    const screenWidth = res.windowWidth || res.screenWidth || 375;
    const statusBarHeight = res.statusBarHeight || 0;

    that.globalData.isIphoneX = /iPhone X/gi.test(model)
    that.globalData.StatusBar = statusBarHeight;
    that.globalData.screenHeight = res.screenHeight || res.windowHeight || 0;
    that.globalData.screenWidth = screenWidth;

    let capsule = null;
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      capsule = wx.getMenuButtonBoundingClientRect();
    }
    if (capsule && capsule.width) {
      that.globalData.Custom = capsule;
      that.globalData.CustomBar = capsule.bottom + capsule.top - statusBarHeight;
    } else {
      that.globalData.CustomBar = statusBarHeight + 80;
    }
    that.globalData.statusBarHeight = statusBarHeight;
    that.globalData.platform = res.platform || '';
    if (model.search("iPhone X") != -1) {
      that.globalData.isIpx = true;
    } else if (model.search("iPhone 11") != -1 || model.search("iPhone 12") != -1) {
      that.globalData.isIp11 = true;
    }

    that.globalSystemInfo = Object.assign({}, res, {
      ios: system.includes('ios'),
      windowWidth: screenWidth,
      screenWidth: screenWidth,
    });

    if (res.platform != "devtools" && typeof wx.setInnerAudioOption === 'function') {
      wx.setInnerAudioOption({
        obeyMuteSwitch: false
      });
    }
  },
  modalTip: function (t) {
    var e = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 2500;
    wx.showToast({
      title: t,
      icon: "none",
      mask: !0,
      duration: e
    });
  },
  showLoading: function () {
    var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "加载中...";
    wx.showLoading({
      title: t,
      mask: !0,
      success: function (t) {}
    });
  },

  onError: function (err) {
    console.error('[InfiniLink app error]', err);
  },

  onUnhandledRejection: function (res) {
    console.error('[InfiniLink unhandled rejection]', res && res.reason ? res.reason : res);
  },

  onShow: function () {
    util.recordUserInteraction('app_show');
    this.startOnlineHeartbeat();
  },

  onHide: function () {
    util.flushTrackedActiveUsage('app_hide', true);
    this.flushOnlineHeartbeat(false);
  },

  startOnlineHeartbeat: function () {
    this.stopOnlineHeartbeat();
    this.globalData.onlineHeartbeatStartedAt = Date.now();
    this.globalData.onlineHeartbeatTimer = setInterval(() => {
      this.flushOnlineHeartbeat(true);
    }, 5 * 60 * 1000);
  },

  stopOnlineHeartbeat: function () {
    if (this.globalData.onlineHeartbeatTimer) {
      clearInterval(this.globalData.onlineHeartbeatTimer);
      this.globalData.onlineHeartbeatTimer = null;
    }
  },

  flushOnlineHeartbeat: function (keepAlive) {
    const startedAt = Number(this.globalData.onlineHeartbeatStartedAt || 0);
    const now = Date.now();
    if (startedAt > 0) {
      const elapsedSeconds = Math.floor((now - startedAt) / 1000);
      if (elapsedSeconds >= 60) {
        util.reportUserActivity({
          online_seconds: Math.min(elapsedSeconds, 300),
          source: 'app'
        });
      }
    }
    if (keepAlive) {
      this.globalData.onlineHeartbeatStartedAt = now;
      return;
    }
    this.stopOnlineHeartbeat();
    this.globalData.onlineHeartbeatStartedAt = 0;
  },

  globalData: {
    isIphoneX: '',
    screenHeight: 0,
    screenWidth: 0,
    statusBarHeight: 0,
    isIpx: false,
    platform: "",
    splashAdShown: false,
    qhTheme: "default",
    shareTitle: "InfiniLink，连接圈子、内容与灵感",
    onlineHeartbeatStartedAt: 0,
    onlineHeartbeatTimer: null,
  }
})
