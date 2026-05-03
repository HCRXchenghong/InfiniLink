const mixins = require('../../../mixins/user')
const pay = require('../../../mixins/pay')

const options = {

  /**
   * 页面的初始数据
   */
  data: {
    configData: {},
    order_price: 999
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    this.configData();
    this.getMembersPrice();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
}

pay(options)
mixins(options)
Page(options)