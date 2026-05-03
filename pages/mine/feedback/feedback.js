const mixins = require('../../../mixins/user')
const app = getApp()
const options = {


  /**
   * 页面的初始数据
   */
  data: {
    descMaxLength: 1000,
    descLength: 0,
    nameLength: 0,
    index: 0,
    cats: ['功能问题', '其他问题'],
    feedback_type: "功能问题",
    feedback_content: "",
    type: 'forum',
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {},

  onInputChange: function (t) {
    var a = t.currentTarget.dataset.type,
      o = t.detail.value;
    if (2 == a) this.setData({
      feedback_content: o,
      descLength: o.length
    });
  },

  bindPickerChange: function (e) {
    this.setData({
      index: e.detail.value,
      feedback_type: this.data.cats[e.detail.value],
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
}

mixins(options)
Page(options)