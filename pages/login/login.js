const mixins = require('../../mixins/user')
const app = getApp();

const options = {

  /**
   * 页面的初始数据
   */
  data: {
    configData: {},
    video: false,
    btnState: false,
    banInfo: null,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.configData();
    this.refreshBanInfo();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    let userInfo = wx.getStorageSync('userInfo');
    this.refreshBanInfo();
    if (userInfo != '') {
      wx.navigateBack();
    };
  },

  refreshBanInfo: function () {
    const banInfo = wx.getStorageSync('banInfo');
    this.setData({
      banInfo: banInfo && typeof banInfo === 'object' ? banInfo : null
    });
  },

  /***
   * 获取用户信息
   */
  getUserInfo: function (e) {
    this.setData({
      btnState: true
    })
    this.loginByWeixin().then(res => {
      wx.navigateBack();
      this.setData({
        btnState: false
      })
    }).catch((err) => {
      console.log(err)
      this.refreshBanInfo();
      this.setData({
        btnState: false
      })
    });
  },

  toTiaoKuan() {
    wx.navigateTo({
      url: '/pages/clause/clause?type=21',
    })
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
