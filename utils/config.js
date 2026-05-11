function isDevtools() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getAppBaseInfo === 'function') {
      return wx.getAppBaseInfo().platform === 'devtools';
    }
  } catch (err) {}
  return false;
}

function resolveAdUnitId(adUnitId) {
  return isDevtools() ? '' : adUnitId;
}

module.exports = {
  tarbar: [{
    pagePath: "/pages/index/index",
    iconPath: "/image/tabbar/home.png",
    selectedIconPath: "/image/tabbar/home_selected.png",
    iconSize: 48,
    text: '首页'
  }, {
    pagePath: "/pages/circle/circle",
    iconPath: "/image/tabbar/follow.png",
    selectedIconPath: "/image/tabbar/follow_selected.png",
    iconSize: 48,
    text: '圈子'
  },
  {
    pagePath: "/pages/creat/creat",
    iconPath: "/image/tabbar/add.png",
    selectedIconPath: "/image/tabbar/add.png"
  },
  {
    pagePath: "/pages/message/message",
    iconPath: "/image/tabbar/message.png",
    selectedIconPath: "/image/tabbar/message_selected.png",
    iconSize: 48,
    text: '消息'
  },
  {
    pagePath: "/pages/mine/mine",
    iconPath: "/image/tabbar/my.png",
    selectedIconPath: "/image/tabbar/my_selected.png",
    iconSize: 48,
    text: '我家'
  }],

  bannerAd: resolveAdUnitId('adunit-cb7afb56bfda5748'),
  videoAd: resolveAdUnitId('adunit-209a6351e42937ec'),
  nativeAd: resolveAdUnitId('adunit-a6a86567263ff359'),
  videoUtAd: '',
  interstitialAd: '',
  rewardedVideoAd: '',
}
