const common = require('../../mixins/common')
const pay = require('../../mixins/pay')
const app = getApp()
import config from "../../utils/config";
const options = {
  /**
   * 页面的初始数据
   */
  data: {
    id: 0,
    page: 1,
    posts: [],
    topicload: true,
    loadmoreShow: false,
    isLastPage: false,
    // 文章组件参数
    focus: false,
    isCommentPage: false,
    inputValue: '',
    imageValue: '',
    ad: config.nativeAd,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    wx.setNavigationBarTitle({
      title: '#' + options.name
    })
    this.setData({
      name: options.name,
      id: options.id,
    })
    this.tagePostsList()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {},

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    let that = this;
    that.setData({
      page: 1,
      posts: [],
      topicload: true,
      loadmoreShow: false,
      isLastPage: false,
    })
    that.tagePostsList()
    wx.hideNavigationBarLoading();
    wx.stopPullDownRefresh();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    let that = this;
    that.setData({
      page: that.data.page + 1,
      loadmoreShow: true,
    })
    that.tagePostsList()
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function (res) {
    if (res && res.from == "button") {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/sticky/sticky?id=' + this.data.postsId,
        imageUrl: '',
      }
    } else {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/tags/tags',
        imageUrl: '',
      }
    }
  },
  //刷新方法
  refreshEvent() {
    this.onPullDownRefresh();
  },
}

pay(options)
common(options)
Page(options)
