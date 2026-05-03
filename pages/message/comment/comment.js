const mixins = require('../../../mixins/message');
const common = require('../../../mixins/common')
var app = getApp();
const options = {


  /**
   * 页面的初始数据
   */
  data: {
    posts: [],
    page: 1,
    isNull: true,
    loadmore: true,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.getDetailsMessages(2);
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    this.readMessages(2);
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {},


  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {},

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
}
mixins(options)
common(options)
Page(options)