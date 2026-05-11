const mixins = require('../../../mixins/user')
const common = require('../../../mixins/common')
var app = getApp();
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    userList: [],
    page: 1,
    isLastPage: false,
    loading: false,
    isUser: true,
    loadmore: true,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.setData({
      type: options.id
    })
    let title = 'InfiniLink';
    if (options.id == 0) {
      if (options.userid != '' && options.userid != undefined) {
        this.setData({
          userid: options.userid,
          isUser: false
        })
        title = 'TA关注的';
      } else {
        title = '我关注的';
      }
    } else {
      if (options.userid != '' && options.userid != undefined) {
        this.setData({
          userid: options.userid,
          isUser: false
        })
        title = '关注TA的';
      } else {
        title = '关注我的';
      }
    }
    wx.setNavigationBarTitle({
      title: title
    })
    this.followUserList();
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
    this.setData({
      userList: [],
      page: 1,
      isLastPage: false,
      loading: false,
      isUser: true,
      loadmore: true,
    })
    this.followUserList();
    wx.stopPullDownRefresh();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    this.setData({
      page: this.data.page + 1,
      loading: true
    })
    this.followUserList();
  },
}

mixins(options)
common(options)
Page(options)
