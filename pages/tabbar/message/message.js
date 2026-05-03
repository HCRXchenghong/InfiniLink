const mixins = require('../../../mixins/message')
const common = require('../../../mixins/common')
var app = getApp();
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    userInfo: {},
    page: 1,
    messageQHList: [{
      img: "/image/qinghang-message.png",
      title: "系统通知",
      content: "",
      date: "",
      count: 0,
      url: "/pages/message/notice/notice"
    }, {
      img: "/image/like-message.png",
      title: "赞和收藏",
      content: "",
      date: "",
      count: 0,
      url: "/pages/message/likeAndfav/likeAndfav"
    }, {
      img: "/image/comments-message.png",
      title: "评论和打赏",
      content: "",
      date: "",
      count: 0,
      url: "/pages/message/comment/comment"
    }],
    messageList: [],
    close: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

  },

  onMenuItem: function (e) {
    var url = e.currentTarget.dataset.url;
    wx.navigateTo({
      url: url,
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    "function" == typeof this.getTabBar && this.getTabBar() && this.getTabBar().setData({
      selected: 3
    })
    let that = this;
    that.getSysMessageCount().then(function (res) {
      that.getTabBar().setData({
        sysMessageCount: res
      })
    })
    let userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      that.setData({
        userInfo: userInfo
      })
      that.getMessages();
      that.getUserChatList();
    } else {
      wx.navigateTo({
        url: '/pages/login/login',
      })
    }
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    this.getMessages()
    this.getUserChatList();
    wx.stopPullDownRefresh();
  },
}

common(options)
mixins(options)
Page(options)