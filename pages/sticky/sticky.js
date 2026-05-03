const common = require('../../mixins/common')
const pay = require('../../mixins/pay')
import config from "../../utils/config";

const options = {

  /**
   * 页面的初始数据
   */
  data: {
    focus: false,
    topicload: true,
    isCommentPage: false,
    inputValue: '',
    imageValue: '',
    ad: config.videoAd,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    var scene = decodeURIComponent(options.scene);
    if (scene != 'undefined') {
      this.postsDetail(scene);
    } else {
      this.postsDetail(options.id);
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {},

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function (res) {
    if (res && res.from == "button") {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/sticky/sticky?id=' + this.data.postsId,
        imageUrl: '',
      }
    } else {
      return {
        title: app.globalData.shareTitle,
        path: '/pages/sticky/sticky',
        imageUrl: '',
      }
    }
  }
}
pay(options)
common(options)
Page(options)
