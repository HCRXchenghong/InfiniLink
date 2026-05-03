const mixins = require('../../../mixins/message');
const common = require('../../../mixins/common')
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
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let that = this;
    wx.setNavigationBarTitle({
      title: options.name
    })
    that.setData({
      oid: options.userid
    })
    that.readUserChat();
  },

  onInputChange: function (e) {
    this.setData({
      chat_content: e.detail.value
    });
  },

  onInputFocus: function (t) {
    var e = wx.getSystemInfoSync(),
      a = parseInt(750 * t.detail.height / e.windowWidth);
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
    that.getUserChat(1);
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    let that = this;
    that.setData({
      page: 1,
      messages: [],
    })
    that.getUserChat(0);
  },
}

mixins(options)
common(options)
Page(options)