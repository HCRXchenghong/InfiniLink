const mixins = require('../../mixins/common')
const app = getApp()
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    categoryMap: [{
      tags_name: '热门',
      id: 0
    }],
    tagid: 0,
    activeTagId: 0,
    page: 1,
    posts: [],
    collapse: false,
    loadmoreShow: false,
    loadingShow: false,
    topicload: true,
    empty: false,
  },

  linfoldTap() {
    this.setData({
      collapse: !this.data.collapse
    })
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.tagsHot();
    this.postsTage();
  },

  //菜单切换
  changeTab: function (e) {
    let that = this;
    let index = e.currentTarget.dataset.index;
    let tagid = e.currentTarget.id;
    that.setData({
      activeTagId: index,
      tagid: tagid,
      posts: [],
      page: 1,
      loadmoreShow: false,
      loadingShow: false,
      topicload: true,
      empty: true,
    })
    that.postsTage();
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
      loadmoreShow: false,
      loadingShow: false,
      topicload: true,
      empty: true,
      page: 1,
      posts: [],
    })
    that.postsTage();
    wx.hideNavigationBarLoading();
    wx.stopPullDownRefresh();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    let that = this;
    that.setData({
      loadmoreShow: true,
      page: that.data.page + 1,
      empty: false,
    })
    that.postsTage();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  },
  //刷新方法
  refreshEvent() {
    this.onPullDownRefresh();
  },
}

mixins(options)
Page(options)