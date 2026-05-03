const mixins = require('../../mixins/user');
var util = require('../../utils/util.js');
const app = getApp();

const options = {

  /**
   * 页面的初始数据
   */
  data: {
    configData: {},
    scene: '',
    btnState: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.configData();
    this.setData({
      scene: options.scene
    })
  },

  toPcLogin() {
    let that = this;
    that.setData({
      btnState: true
    })
    let res = util.loginNow();
    if (res == true) {
      that.pcLogin();
    }
  },


  /**
   * 返回登陆
   */
  back: function () {
    wx.reLaunch({
      url: '/pages/tabbar/index/index',
    })
  }
}

mixins(options)
Page(options)