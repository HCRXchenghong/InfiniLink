const mixins = require('../../../mixins/message');
var app = getApp();
const options = {

  /**
   * 页面的初始数据
   */
  data: {
    page: 1,
    messageList: [],
    isNull: true,
    loadmore: true,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.getDetailsMessages(0);
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    this.readMessages(0);
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
}
mixins(options)
Page(options)