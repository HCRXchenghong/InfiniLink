Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  handlerClearCache: function (e) {
    wx.showModal({
      title: '提示',
      content: '清除缓存 需要重新登录',
      success(res) {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.showToast({
            title: '清除完毕',
          });
        }
      }
    });
  },

  shutLogin: function (e) {
    wx.clearStorageSync();
    wx.reLaunch({
      url: '/pages/tabbar/index/index',
    })
  },
})