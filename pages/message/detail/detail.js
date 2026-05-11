const mixins = require('../../../mixins/message');
const common = require('../../../mixins/common')
const socket = require('../../../utils/socket')
var app = getApp();
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    chat_content: "",
    keyboardHeight: 400,
    messages: [],
    oid: 0,
    page: 1,
    userInfo: {},
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let that = this;
    let title = options.name || '聊天';
    try {
      title = decodeURIComponent(title);
    } catch (err) {}
    wx.setNavigationBarTitle({
      title: title
    })
    that.setData({
      oid: Number(options.userid || 0)
    })
    that.readUserChat();
  },

  refreshConversation: function () {
    this.getUserChat(1);
    this.readUserChat();
    socket.markChatRead(Number(this.data.oid)).catch(function () {})
  },

  appendSocketMessage: function (message) {
    if (!message || !message.id) {
      return;
    }

    const exists = (this.data.messages || []).some(function (item) {
      return Number(item.id) === Number(message.id);
    });
    if (exists) {
      return;
    }

    this.setData({
      messages: (this.data.messages || []).concat([message])
    })
  },

  bindRealtimeConversation: function () {
    if (this._conversationRealtimeBound) {
      return;
    }

    let that = this;
    that._handleSocketConversation = function (event) {
      const message = event && event.message ? event.message : null;
      const currentUserID = Number((that.data.userInfo || {}).id || 0);
      const targetUserID = Number(that.data.oid || 0);
      if (!message || !currentUserID || !targetUserID) {
        return;
      }

      const senderID = Number(message.sender_id || 0);
      const receiverID = Number(message.receiver_id || 0);
      const isCurrentConversation = (
        senderID === currentUserID && receiverID === targetUserID
      ) || (
        senderID === targetUserID && receiverID === currentUserID
      );

      if (!isCurrentConversation) {
        return;
      }

      that.appendSocketMessage(message);
      if (senderID === targetUserID) {
        that.readUserChat();
        socket.markChatRead(targetUserID).catch(function () {})
      }
    }

    that._handleSocketOpen = function () {
      socket.markChatRead(Number(that.data.oid)).catch(function () {})
    }

    socket.on('chat.message', that._handleSocketConversation);
    socket.on('open', that._handleSocketOpen);
    that._conversationRealtimeBound = true;
    socket.connect().catch(function () {})
  },

  unbindRealtimeConversation: function () {
    if (!this._conversationRealtimeBound) {
      return;
    }
    socket.off('chat.message', this._handleSocketConversation);
    socket.off('open', this._handleSocketOpen);
    this._handleSocketConversation = null;
    this._handleSocketOpen = null;
    this._conversationRealtimeBound = false;
  },

  onInputChange: function (e) {
    this.setData({
      chat_content: e.detail.value
    });
  },

  onInputFocus: function (t) {
    var windowWidth = app.globalData.screenWidth ||
      ((typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo().windowWidth : 0) || 375),
      a = parseInt(750 * t.detail.height / windowWidth);
    a > 0 && this.data.keyboardHeight != a && (this.data.keyboardHeight = a);
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    let that = this;
    that.setData({
      page: that.data.page + 1,
    })
    that.getUserChat(0);
    wx.stopPullDownRefresh();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    let that = this;
    that.setData({
      userInfo: wx.getStorageSync('userInfo') || {}
    })
    that.refreshConversation();
    that.bindRealtimeConversation();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    return;
  },

  onHide: function () {
    this.unbindRealtimeConversation();
  },

  onUnload: function () {
    this.unbindRealtimeConversation();
  },
}

mixins(options)
common(options)
Page(options)
