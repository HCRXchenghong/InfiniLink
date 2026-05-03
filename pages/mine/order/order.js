const mixins = require('../../../mixins/user')
const common = require('../../../mixins/common')
const app = getApp()
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    loading: true,
    loadmore: false,
    isLastPage: false,
    page: 1,
    orderList: [],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.myOrder();
  },

  copyTap(e) {
    wx.setClipboardData({
      data: e.currentTarget.dataset.no,
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    let that = this;
    that.setData({
      loading: true,
      loadmore: false,
      isLastPage: false,
      page: 1,
      orderList: [],
    })
    that.myOrder();
    wx.hideNavigationBarLoading();
    wx.stopPullDownRefresh();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    let that = this;
    that.setData({
      loadmore: true,
      isLastPage: false,
      page: that.data.page + 1,
    })
    that.myOrder();
  },
}

common(options)
mixins(options)
Page(options)