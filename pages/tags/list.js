const mixins = require('../../mixins/circle')
const common = require('../../mixins/common')
const app = getApp()
const options = {
  /**
   * 页面的初始数据
   */
  data: {
    defaultPlate: ["关注", "推荐", "热榜"],
    header: [],
    cats: [],
    page: 1,
    delSta: 0,
  },

  bteTap() {
    let that = this;
    that.setData({
      delSta: 1
    })
  },

  yesTap() {
    let that = this;
    that.setData({
      delSta: 0
    })
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    this.userPlate();
    this.geToptionsList();
  },

}


mixins(options)
common(options)
Page(options)