const mixins = require('../../../mixins/user')
const app = getApp()

const options = {
  /**
   * 页面的初始数据
   */
  data: {
    subcats: [],
    subcatsloading: true,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.userCricle();
  },

  toEditor: function (e) {
    wx.navigateTo({
      url: '/pages/circle/creat?type=1&id=' + e.currentTarget.dataset.id,
    })
  },

  toStick: function (e) {
    wx.navigateTo({
      url: '/pages/circle/circleaudit?id=' + e.currentTarget.dataset.id,
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

}

mixins(options)
Page(options)