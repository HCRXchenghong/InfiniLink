App({
  onLaunch: function (options) {
    const updateManager = wx.getUpdateManager();
    updateManager.onUpdateReady(function () {
      wx.showModal({
        title: '更新提示',
        content: '全新的「轻航」已经准备好，请更新重启轻航',
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
    wx.getSystemInfo({
      success: function success(res) {
        that.globalData.isIphoneX = res.model.match(/iPhone X/gi)
        that.globalData.StatusBar = res.statusBarHeight;
        that.globalData.screenHeight = res.screenHeight;
        let capsule = wx.getMenuButtonBoundingClientRect();
        if (capsule) {
          that.globalData.Custom = capsule;
          that.globalData.CustomBar = capsule.bottom + capsule.top - res.statusBarHeight;
        } else {
          that.globalData.CustomBar = res.statusBarHeight + 80;
        }
        that.globalData.statusBarHeight = res.statusBarHeight;
        that.globalData.platform = res.platform;
        if (res.model.search("iPhone X") != -1) {
          that.globalData.isIpx = true;
        } else if (res.model.search("iPhone 11") != -1 || res.model.search("iPhone 12") != -1) {
          that.globalData.isIp11 = true;
        }
        if (res.platform != "devtools") {
          wx.setInnerAudioOption({
            obeyMuteSwitch: false
          });
        }
      }
    });
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

  onShow: function () {},

  globalData: {
    isIphoneX: '',
    screenHeight: 0,
    statusBarHeight: 0,
    isIpx: false,
    platform: "",
    qhTheme: "default",
    shareTitle: "轻航，专属互联网人的内容兴趣社区",
  }
})