const mixins = require('../../../mixins/message')
const common = require('../../../mixins/common')
const socket = require('../../../utils/socket')
var app = getApp();
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    userInfo: {},
    page: 1,
    messageQHList: [{
      img: "/image/infinilink-message.png",
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
    customerServiceThread: null,
    close: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

  },

  refreshRealtimeMessageState: function () {
    let that = this;
    that.getMessages();
    that.getCustomerServiceProfile();
    that.getUserChatList();
    that.getSysMessageCount().then(function (res) {
      if ("function" == typeof that.getTabBar && that.getTabBar()) {
        that.getTabBar().setData({
          sysMessageCount: res
        })
      }
    })
  },

  bindRealtimeMessageEvents: function () {
    if (this._realtimeBound) {
      return;
    }

    let that = this;
    that._handleRealtimeRefresh = function () {
      const userInfo = wx.getStorageSync('userInfo')
      if (!userInfo || !userInfo.id) {
        return;
      }
      that.refreshRealtimeMessageState();
    }

    socket.on('open', that._handleRealtimeRefresh);
    socket.on('chat.message', that._handleRealtimeRefresh);
    socket.on('notification.refresh', that._handleRealtimeRefresh);
    that._realtimeBound = true;
    socket.connect().catch(function () {})
  },

  unbindRealtimeMessageEvents: function () {
    if (!this._realtimeBound) {
      return;
    }
    socket.off('open', this._handleRealtimeRefresh);
    socket.off('chat.message', this._handleRealtimeRefresh);
    socket.off('notification.refresh', this._handleRealtimeRefresh);
    this._handleRealtimeRefresh = null;
    this._realtimeBound = false;
  },

  onMenuItem: function (e) {
    var url = e.currentTarget.dataset.url;
    wx.navigateTo({
      url: url,
    })
  },

  openCustomerServiceChat: function () {
    const thread = this.data.customerServiceThread;
    const customer = thread && thread.user ? thread.user : null;
    if (!customer || !customer.id) {
      wx.showToast({
        title: '客服暂不可用',
        icon: 'none'
      })
      return;
    }
    wx.navigateTo({
      url: '/pages/message/detail/detail?userid=' + customer.id + '&name=' + encodeURIComponent(customer.user_name || '官方客服'),
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
    let userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      that.setData({
        userInfo: userInfo
      })
      that.refreshRealtimeMessageState();
      that.bindRealtimeMessageEvents();
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
    this.refreshRealtimeMessageState();
    wx.stopPullDownRefresh();
  },

  onHide: function () {
    this.unbindRealtimeMessageEvents();
  },

  onUnload: function () {
    this.unbindRealtimeMessageEvents();
  },
}

common(options)
mixins(options)
Page(options)
