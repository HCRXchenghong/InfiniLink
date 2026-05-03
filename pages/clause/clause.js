const api = require('../../config/api');
const util = require('../../utils/util');

Page({

  /**
   * 页面的初始数据
   */
  data: {
    htmlSnip: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    let that = this;
    util.request(api.getClauseDetailUrl, {
      id: options.type
    }).then(function (res) {
      that.setData({
        htmlSnip: res.data.content
      })
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },
})