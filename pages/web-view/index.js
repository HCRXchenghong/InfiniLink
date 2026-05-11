Page({

  /**
   * 页面的初始数据
   */
  data: {
    url: '',
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let url = options.url || ''
    try {
      url = decodeURIComponent(url)
    } catch (err) {}
    this.setData({
      url: url
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  handleMessage: function (event) {
    const detail = event && event.detail ? event.detail : {};
    const messages = Array.isArray(detail.data) ? detail.data : [];
    const latest = messages.length ? messages[messages.length - 1] : {};
    if (latest && latest.type === 'ifpay-oauth' && latest.success) {
      wx.showToast({
        title: 'IF-Pay 已授权',
        icon: 'none',
        duration: 1500
      });
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
})
